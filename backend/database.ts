import fs from 'fs';
import crypto from 'crypto';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import pg from 'pg';
import { DB_PATH, DATABASE_URL as CONFIG_DATABASE_URL } from './config.js';

const { Pool } = pg;

let dbInstance: Database | null = null;
let pgPoolInstance: pg.Pool | null = null;
let pgPoolInitialization: Promise<pg.Pool> | null = null;
let activeDatabaseUrl: string = CONFIG_DATABASE_URL;

// All CampusFind instances use this fixed lock key to serialize PostgreSQL DDL and
// duplicate-approval reconciliation during startup. Keep it stable across releases.
const POSTGRES_SCHEMA_STARTUP_LOCK_KEY = 7_483_921_650_274_113_907n;
let POSTGRES_SCHEMA_STARTUP_LOCK_TIMEOUT_MS = 60_000;
const POSTGRES_SCHEMA_STARTUP_LOCK_POLL_MS = 250;

/** Test-only hook for reducing the lock-timeout probe duration in the disposable integration suite. */
export function setPostgresStartupLockTimeoutForTesting(timeoutMs: number): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('PostgreSQL startup lock timeout override is available only when NODE_ENV=test.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error('PostgreSQL startup lock test timeout must be an integer between 1 and 10000 ms.');
  }
  POSTGRES_SCHEMA_STARTUP_LOCK_TIMEOUT_MS = timeoutMs;
}

async function acquirePostgresSchemaStartupLock(client: pg.PoolClient): Promise<void> {
  const deadline = Date.now() + POSTGRES_SCHEMA_STARTUP_LOCK_TIMEOUT_MS;
  while (true) {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      [POSTGRES_SCHEMA_STARTUP_LOCK_KEY.toString()]
    );
    if (result.rows[0]?.locked === true) return;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `Timed out acquiring PostgreSQL schema startup advisory lock (key ${POSTGRES_SCHEMA_STARTUP_LOCK_KEY.toString()}) after ${POSTGRES_SCHEMA_STARTUP_LOCK_TIMEOUT_MS} ms.`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(POSTGRES_SCHEMA_STARTUP_LOCK_POLL_MS, remainingMs)));
  }
}

/**
 * Translates SQLite '?' parameter placeholders to PostgreSQL '$1, $2, $3...' placeholders.
 * Properly ignores '?' characters occurring inside single-quoted string literals.
 */
export function translatePlaceholders(sql: string): string {
  let paramIndex = 1;
  let inQuote = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      // Handle escaped single quotes '' in standard SQL strings
      if (inQuote && sql[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inQuote = !inQuote;
      result += char;
    } else if (char === '?' && !inQuote) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Returns true if the application is running in PostgreSQL mode.
 * Active when DATABASE_URL is present and specifies a PostgreSQL connection string.
 */
export function isPostgresMode(): boolean {
  if (!activeDatabaseUrl || activeDatabaseUrl.trim().length === 0) {
    return false;
  }
  const trimmed = activeDatabaseUrl.trim().toLowerCase();
  return trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://');
}

/**
 * Overrides the active database URL for testing or dynamic configuration.
 */
export function setDatabaseUrlForTesting(url: string | null): void {
  activeDatabaseUrl = url || '';
  if (pgPoolInstance) {
    pgPoolInstance.end().catch(() => {});
    pgPoolInstance = null;
    pgPoolInitialization = null;
  }
}

/**
 * Retrieves the singleton PostgreSQL connection pool, initializing schema if needed.
 * Never logs credentials or DATABASE_URL.
 */
export async function getPgPool(): Promise<pg.Pool> {
  if (pgPoolInstance) {
    return pgPoolInitialization || pgPoolInstance;
  }

  const isLocal =
    activeDatabaseUrl.includes('localhost') ||
    activeDatabaseUrl.includes('127.0.0.1') ||
    activeDatabaseUrl.includes('0.0.0.0');

  const pool = new Pool({
    connectionString: activeDatabaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pgPoolInstance = pool;

  let initialization: Promise<pg.Pool>;
  initialization = (async () => {
    let startupClient: pg.PoolClient | null = null;
    let lockAcquired = false;
    let startupFailure: unknown;
    try {
      // Keep the lock on one dedicated session while all DDL and data cleanup
      // run through this pool. Separate app instances serialize on this key.
      startupClient = await pool.connect();
      await acquirePostgresSchemaStartupLock(startupClient);
      lockAcquired = true;
      await initPostgresSchema(pool);
    } catch (err) {
      startupFailure = err;
    } finally {
      if (startupClient) {
        try {
          if (lockAcquired) {
            const unlockResult = await startupClient.query<{ pg_advisory_unlock: boolean }>(
              'SELECT pg_advisory_unlock($1::bigint)',
              [POSTGRES_SCHEMA_STARTUP_LOCK_KEY.toString()]
            );
            if (unlockResult.rows[0]?.pg_advisory_unlock !== true) {
              throw new Error('PostgreSQL startup advisory lock was not held when unlock was attempted.');
            }
          }
        } catch (unlockError) {
          const cause = unlockError instanceof Error ? unlockError.message : String(unlockError);
          console.error(`[database] Failed to release PostgreSQL startup advisory lock. Cause: ${cause}`);
          if (!startupFailure) startupFailure = unlockError;
        } finally {
          startupClient.release();
        }
      }
    }

    if (startupFailure) {
      const cause = startupFailure instanceof Error ? startupFailure.message : String(startupFailure);
      console.error(`[database] PostgreSQL schema initialization failed while acquiring/holding the startup advisory lock. Cause: ${cause}`);
      await pool.end().catch(() => {});
      if (pgPoolInstance === pool) pgPoolInstance = null;
      throw startupFailure;
    }
    return pool;
  })();
  pgPoolInitialization = initialization;
  try {
    return await initialization;
  } finally {
    if (pgPoolInitialization === initialization) pgPoolInitialization = null;
  }
}

const DUPLICATE_APPROVAL_RESET_NOTE = 'Auto-reset: duplicate approval detected during migration';
const APPROVAL_CLEANUP_AUDIT_ACTOR = 'system:migration';

/**
 * SQL.js bundles a modern SQLite engine, but keep a small JS fallback so a build
 * with older SQLite window-function support can still recover existing data.
 */
function duplicateApprovedClaimsSqlite(db: Database): Array<{ id: string; item_id: string }> {
  try {
    const result = db.exec(`
      SELECT id, item_id
      FROM (
        SELECT id, item_id,
          ROW_NUMBER() OVER (
            PARTITION BY item_id
            ORDER BY
              CASE WHEN claimant_confirmed_at IS NOT NULL AND finder_confirmed_at IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN reviewed_at IS NULL THEN 1 ELSE 0 END,
              reviewed_at ASC,
              id ASC
          ) AS approval_rank
        FROM claims
        WHERE status = 'APPROVED'
      ) ranked
      WHERE approval_rank > 1
      ORDER BY item_id, approval_rank
    `);
    return (result[0]?.values || []).map((row) => ({ id: String(row[0]), item_id: String(row[1]) }));
  } catch {
    // Fallback only for SQLite builds without ROW_NUMBER/window-function support.
    const result = db.exec(`
      SELECT id, item_id, claimant_confirmed_at, finder_confirmed_at, reviewed_at
      FROM claims
      WHERE status = 'APPROVED'
      ORDER BY item_id,
        CASE WHEN claimant_confirmed_at IS NOT NULL AND finder_confirmed_at IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN reviewed_at IS NULL THEN 1 ELSE 0 END,
        reviewed_at ASC,
        id ASC
    `);
    const rows = (result[0]?.values || []).map((row) => ({
      id: String(row[0]),
      item_id: String(row[1]),
    }));
    const seenItems = new Set<string>();
    return rows.filter((row) => {
      if (!seenItems.has(row.item_id)) {
        seenItems.add(row.item_id);
        return false;
      }
      return true;
    });
  }
}

function reconcileDuplicateApprovalsSqlite(db: Database): void {
  let affectedItemIds: string[] = [];
  try {
    db.run('BEGIN IMMEDIATE TRANSACTION');
    const resetClaims = duplicateApprovedClaimsSqlite(db);
    affectedItemIds = [...new Set(resetClaims.map((claim) => claim.item_id))];
    const now = new Date().toISOString();

    for (const claim of resetClaims) {
      db.run(
        `UPDATE claims
         SET status = 'PENDING', handover_code = NULL,
             claimant_confirmed_at = NULL, finder_confirmed_at = NULL,
             moderator_note = CASE
               WHEN moderator_note IS NULL OR TRIM(moderator_note) = '' THEN ?
               ELSE moderator_note || ' | ' || ?
             END
         WHERE id = ? AND item_id = ? AND status = 'APPROVED'`,
        [DUPLICATE_APPROVAL_RESET_NOTE, DUPLICATE_APPROVAL_RESET_NOTE, claim.id, claim.item_id]
      );
      if (db.getRowsModified() !== 1) continue;

      db.run(
        `INSERT INTO audit_logs (id, action, moderator_id, target, timestamp, note)
         VALUES (?, 'CLAIM_DUPLICATE_APPROVAL_RESET', ?, ?, ?, ?)`,
        [
          `audit_migration_${crypto.randomUUID()}`,
          APPROVAL_CLEANUP_AUDIT_ACTOR,
          `Claim ${claim.id} on item ${claim.item_id}`,
          now,
          DUPLICATE_APPROVAL_RESET_NOTE,
        ]
      );
    }

    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_one_approved_per_item ON claims(item_id) WHERE status = 'APPROVED'`);
    db.run('COMMIT');
  } catch (err) {
    try { db.run('ROLLBACK'); } catch { /* Preserve original migration failure. */ }
    const cause = err instanceof Error ? err.message : String(err);
    console.error(
      `[database] Failed to reconcile duplicate APPROVED claims and create the unique index. Cause: ${cause}. Affected item IDs: ${affectedItemIds.length ? affectedItemIds.join(', ') : 'none identified before failure'}.`
    );
    throw err;
  }
}

async function reconcileDuplicateApprovalsPostgres(pool: pg.Pool): Promise<void> {
  let affectedItemIds: string[] = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string; item_id: string }>(`
      SELECT id, item_id
      FROM (
        SELECT id, item_id,
          ROW_NUMBER() OVER (
            PARTITION BY item_id
            ORDER BY
              CASE WHEN claimant_confirmed_at IS NOT NULL AND finder_confirmed_at IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN reviewed_at IS NULL THEN 1 ELSE 0 END,
              reviewed_at ASC,
              id ASC
          ) AS approval_rank
        FROM claims
        WHERE status = 'APPROVED'
      ) ranked
      WHERE approval_rank > 1
      ORDER BY item_id, approval_rank
    `);
    const resetClaims: Array<{ id: string; item_id: string }> = result.rows;
    affectedItemIds = [...new Set<string>(resetClaims.map((claim) => claim.item_id))];
    const now = new Date().toISOString();

    for (const claim of resetClaims) {
      const updated = await client.query(
        `UPDATE claims
         SET status = 'PENDING', handover_code = NULL,
             claimant_confirmed_at = NULL, finder_confirmed_at = NULL,
             moderator_note = CASE
               WHEN moderator_note IS NULL OR BTRIM(moderator_note) = '' THEN $1
               ELSE moderator_note || ' | ' || $1
             END
         WHERE id = $2 AND item_id = $3 AND status = 'APPROVED'`,
        [DUPLICATE_APPROVAL_RESET_NOTE, claim.id, claim.item_id]
      );
      if (updated.rowCount !== 1) continue;

      await client.query(
        `INSERT INTO audit_logs (id, action, moderator_id, target, timestamp, note)
         VALUES ($1, 'CLAIM_DUPLICATE_APPROVAL_RESET', $2, $3, $4, $5)`,
        [
          `audit_migration_${crypto.randomUUID()}`,
          APPROVAL_CLEANUP_AUDIT_ACTOR,
          `Claim ${claim.id} on item ${claim.item_id}`,
          now,
          DUPLICATE_APPROVAL_RESET_NOTE,
        ]
      );
    }

    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_one_approved_per_item ON claims(item_id) WHERE status = 'APPROVED'`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const cause = err instanceof Error ? err.message : String(err);
    console.error(
      `[database] Failed to reconcile duplicate APPROVED claims and create the unique index. Cause: ${cause}. Affected item IDs: ${affectedItemIds.length ? affectedItemIds.join(', ') : 'none identified before failure'}.`
    );
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Initializes the PostgreSQL schema equivalent to SQLite.
 */
export async function initPostgresSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      phone TEXT,
      contact_info TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      event_time TEXT NOT NULL,
      image_url TEXT,
      image_embedding TEXT,
      verification_detail TEXT,
      verification_hint TEXT,
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      lost_item_id TEXT NOT NULL,
      found_item_id TEXT NOT NULL,
      image_score DOUBLE PRECISION,
      text_score DOUBLE PRECISION NOT NULL,
      category_score DOUBLE PRECISION NOT NULL,
      location_score DOUBLE PRECISION NOT NULL,
      time_score DOUBLE PRECISION NOT NULL,
      total_score DOUBLE PRECISION NOT NULL,
      explanation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (lost_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (found_item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      claimant_id TEXT NOT NULL,
      message TEXT NOT NULL,
      verification_answer TEXT NOT NULL,
      handover_code TEXT,
      claimant_confirmed_at TEXT,
      finder_confirmed_at TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      moderator_id TEXT,
      moderator_note TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      target TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_owner ON items(owner_id);
    CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
    CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
    CREATE INDEX IF NOT EXISTS idx_claims_claimant ON claims(claimant_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  `);

  // Migrate existing deployments that were created before finder verification / handover fields existed.
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS verification_detail TEXT`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS verification_hint TEXT`);
  await pool.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS handover_code TEXT`);
  await pool.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS claimant_confirmed_at TEXT`);
  await pool.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS finder_confirmed_at TEXT`);
  await reconcileDuplicateApprovalsPostgres(pool);
}

/**
 * Initializes and returns the SQL.js/SQLite database instance (fallback for local dev & testing).
 */
export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();
  let initializingDb: Database;
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      initializingDb = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Could not read existing database file, creating new database.', err);
      initializingDb = new SQL.Database();
    }
  } else {
    initializingDb = new SQL.Database();
  }

  try {
    initSchema(initializingDb);
    // Publish the singleton only after all schema migrations and indexes succeed.
    dbInstance = initializingDb;
    saveDb();
    return initializingDb;
  } catch (err) {
    try { initializingDb.close(); } catch { /* Preserve original initialization error. */ }
    throw err;
  }
}

/**
 * Persists SQLite in-memory database to disk.
 * In PostgreSQL mode, this is safely a no-op since PostgreSQL manages persistence.
 */
export function saveDb(): void {
  if (isPostgresMode()) {
    return; // No-op in PostgreSQL mode
  }
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to persist database to disk:', err);
  }
}

function ensureSqliteColumn(db: Database, tableName: string, columnName: string, definition: string): void {
  const columns = db.exec(`PRAGMA table_info(${tableName})`);
  const existing = (columns[0]?.values || []).some((row) => row[1] === columnName);
  if (!existing) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

/**
 * Initializes SQLite schema.
 */
export function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      phone TEXT,
      contact_info TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'LOST' or 'FOUND'
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      event_time TEXT NOT NULL,
      image_url TEXT,
      image_embedding TEXT, -- JSON stringified array of numbers
      verification_detail TEXT, -- finder-only hidden detail; never mapped into public Item responses
      verification_hint TEXT, -- public hint describing the kind of verification detail recorded
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'MATCHED', 'RESOLVED'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      lost_item_id TEXT NOT NULL,
      found_item_id TEXT NOT NULL,
      image_score REAL,
      text_score REAL NOT NULL,
      category_score REAL NOT NULL,
      location_score REAL NOT NULL,
      time_score REAL NOT NULL,
      total_score REAL NOT NULL,
      explanation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (lost_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (found_item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      claimant_id TEXT NOT NULL,
      message TEXT NOT NULL,
      verification_answer TEXT NOT NULL,
      handover_code TEXT,
      claimant_confirmed_at TEXT,
      finder_confirmed_at TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
      moderator_id TEXT,
      moderator_note TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      target TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      note TEXT
    );

    -- Security and performance indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_owner ON items(owner_id);
    CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
    CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
    CREATE INDEX IF NOT EXISTS idx_claims_claimant ON claims(claimant_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  `);

  ensureSqliteColumn(db, 'items', 'verification_detail', 'TEXT');
  ensureSqliteColumn(db, 'items', 'verification_hint', 'TEXT');
  ensureSqliteColumn(db, 'claims', 'handover_code', 'TEXT');
  ensureSqliteColumn(db, 'claims', 'claimant_confirmed_at', 'TEXT');
  ensureSqliteColumn(db, 'claims', 'finder_confirmed_at', 'TEXT');
  reconcileDuplicateApprovalsSqlite(db);
}

/**
 * Universal query utility for both PostgreSQL and SQLite.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (SqlValue | unknown)[] = []
): Promise<T[]> {
  if (isPostgresMode()) {
    const pool = await getPgPool();
    const translatedSql = translatePlaceholders(sql);
    const result = await pool.query(translatedSql, params);
    return result.rows as T[];
  }

  const db = await getDb();
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params as SqlValue[]);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return results;
}

/**
 * Universal queryOne utility returning a single record or null.
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: (SqlValue | unknown)[] = []
): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Universal execute utility for DML operations.
 */
export async function execute(
  sql: string,
  params: (SqlValue | unknown)[] = []
): Promise<number> {
  if (isPostgresMode()) {
    const pool = await getPgPool();
    const translatedSql = translatePlaceholders(sql);
    const result = await pool.query(translatedSql, params);
    return result.rowCount ?? 0;
  }

  const db = await getDb();
  db.run(sql, params as SqlValue[]);
  const changedRows = db.getRowsModified();
  saveDb();
  return changedRows;
}

/**
 * Resets the database (for testing and migrations).
 */
export async function resetDatabase(): Promise<void> {
  if (isPostgresMode()) {
    const pool = await getPgPool();
    await pool.query(`
      TRUNCATE TABLE audit_logs, notifications, claims, matches, items, refresh_tokens, users CASCADE;
    `);
    return;
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
    } catch {
      // ignore
    }
  }
  dbInstance = null;
  await getDb();
}

/**
 * Gracefully shuts down active database connections.
 */
export async function closeDatabase(): Promise<void> {
  if (pgPoolInstance) {
    await pgPoolInstance.end();
    pgPoolInstance = null;
    pgPoolInitialization = null;
  }
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}
