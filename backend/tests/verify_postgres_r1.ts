/**
 * Destructive PostgreSQL smoke/integration checks for startup serialization,
 * duplicate-approval recovery, and approval/handover concurrency. Use only a
 * disposable database whose name has 'test' as a whole segment.
 *
 * Run:
 *   DATABASE_URL=postgresql://postgres:pw@localhost:5432/campusfind_test \
 *   NODE_ENV=test ALLOW_DESTRUCTIVE_POSTGRES_TESTS=YES npm run test:postgres-r1
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
import {
  closeDatabase,
  execute,
  getPgPool,
  isPostgresMode,
  query,
  queryOne,
  resetDatabase,
} from '../database.js';
import { createItem } from '../services/itemService.js';
import { approveClaim, confirmHandover, createClaim } from '../services/claimService.js';

const { Pool } = pg;

function pass(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function seedUsers(): Promise<void> {
  const now = new Date().toISOString();
  const users = [
    ['pg_r1_finder', 'R1 Finder', 'pg_r1_finder@test.edu', 'STUDENT'],
    ['pg_r1_claimant_a', 'R1 Claimant A', 'pg_r1_claimant_a@test.edu', 'STUDENT'],
    ['pg_r1_claimant_b', 'R1 Claimant B', 'pg_r1_claimant_b@test.edu', 'STUDENT'],
    ['pg_r1_moderator', 'R1 Moderator', 'pg_r1_moderator@test.edu', 'MODERATOR'],
  ];
  for (const [id, name, email, role] of users) {
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, email, 'test-only-not-a-real-password', role, now]
    );
  }
}

async function foundItem(title: string) {
  return createItem({
    type: 'FOUND',
    title,
    description: 'Disposable PostgreSQL R1 integration test item',
    category: 'Electronics',
    location: 'R1 test area',
    latitude: 0,
    longitude: 0,
    event_time: new Date().toISOString(),
    verification_detail: 'R1 private verification detail',
    verification_hint: 'OTHER',
    owner_id: 'pg_r1_finder',
  });
}

export function validateDestructivePostgresTarget(env: NodeJS.ProcessEnv = process.env): void {
  const rawUrl = env.DATABASE_URL || '';
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing destructive PostgreSQL test: NODE_ENV=production is not allowed.');
  }
  if (env.ALLOW_DESTRUCTIVE_POSTGRES_TESTS !== 'YES') {
    throw new Error('Refusing destructive PostgreSQL test: set ALLOW_DESTRUCTIVE_POSTGRES_TESTS=YES explicitly.');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Refusing destructive PostgreSQL test: DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`Refusing destructive PostgreSQL test: unsupported DATABASE_URL protocol ${parsed.protocol || '(missing)'}.`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const databaseNameSegments = databaseName.toLowerCase().split(/[_-]+/).filter(Boolean);
  if (!databaseNameSegments.includes('test')) {
    throw new Error(`Refusing destructive PostgreSQL test: database name '${databaseName || '(empty)'}' must contain 'test' as a whole name segment (separated by _ or -).`);
  }
  const host = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(host)) {
    throw new Error(`Refusing destructive PostgreSQL test: host '${host}' is not on the local allowlist.`);
  }
}

async function runConcurrentStartupProbe(label: string): Promise<void> {
  // Child processes each have an independent module singleton and connection pool,
  // matching separate application instances starting on the same database.
  const moduleUrl = new URL('../database.ts', import.meta.url).href;
  const script = `
    import { getPgPool, closeDatabase } from ${JSON.stringify(moduleUrl)};
    try { await getPgPool(); console.log('STARTUP_OK'); }
    catch (error) { console.error(error?.stack || error); process.exitCode = 1; }
    finally { await closeDatabase().catch(() => {}); }
  `;
  const runs = await Promise.all(Array.from({ length: 10 }, () => new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', (error) => resolve({ code: 1, output: String(error) }));
    child.on('close', (code) => resolve({ code, output }));
  })));
  const failures = runs.filter((run) => run.code !== 0 || !run.output.includes('STARTUP_OK'));
  if (failures.length) {
    throw new Error(`${label}: ${failures.length}/10 parallel app startups failed.\n${failures.map((failure) => failure.output).join('\n---\n')}`);
  }
  pass(runs.length === 10 && failures.length === 0, `${label}: ten simultaneous getPgPool startup processes succeed`);
}

async function verifyStartupLockTimeoutAndRecovery(): Promise<void> {
  const rawPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 1 });
  const lockClient = await rawPool.connect();
  const lockKey = '7483921650274113907';
  let lockHeld = false;
  try {
    await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [lockKey]);
    lockHeld = true;
    const moduleUrl = new URL('../database.ts', import.meta.url).href;
    const script = `
      import { getPgPool, closeDatabase, setPostgresStartupLockTimeoutForTesting } from ${JSON.stringify(moduleUrl)};
      setPostgresStartupLockTimeoutForTesting(1000);
      try { await getPgPool(); console.error('UNEXPECTED_STARTUP_SUCCESS'); process.exitCode = 2; }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        if (message.includes('Timed out acquiring PostgreSQL schema startup advisory lock') && message.includes(${JSON.stringify(lockKey)})) {
          console.log('EXPECTED_LOCK_TIMEOUT');
        } else { process.exitCode = 1; }
      } finally { await closeDatabase().catch(() => {}); }
    `;
    const startedAt = Date.now();
    const child = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const processChild = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      processChild.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      processChild.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      processChild.on('error', (error) => resolve({ code: 1, output: String(error) }));
      processChild.on('close', (code) => resolve({ code, output }));
    });
    const elapsedMs = Date.now() - startedAt;
    pass(child.code === 0 && child.output.includes('EXPECTED_LOCK_TIMEOUT') && elapsedMs >= 900, 'startup lock polling fails clearly after the configured deadline when another session holds the lock');
  } finally {
    if (lockHeld) await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [lockKey]).catch(() => {});
    lockClient.release();
    await rawPool.end();
  }

  // Once the competing session releases the lock, normal startup must succeed again.
  const recovered = await getPgPool();
  const check = await recovered.query('SELECT 1 AS ok');
  pass(Number(check.rows[0]?.ok) === 1, 'PostgreSQL startup succeeds after the held advisory lock is released');
  await closeDatabase();
}

async function chooseEphemeralLocalPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function verifyProductionServerStartupAndGracefulShutdown(): Promise<void> {
  const port = await chooseEphemeralLocalPort();
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: 'production-startup-test-jwt-secret-000001',
      JWT_REFRESH_SECRET: 'production-startup-test-refresh-secret-0001',
      VERIFICATION_DETAIL_AUDIT_SECRET: 'production-startup-test-audit-secret-000001',
      UPLOAD_DIR: '/tmp/campusfind-postgres-startup-test-uploads',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });

  let healthy = false;
  const startupDeadline = Date.now() + 15_000;
  try {
    while (Date.now() < startupDeadline) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
        const body = await response.json() as { status?: string; database?: string };
        if (response.status === 200 && body.status === 'ok' && body.database === 'healthy') {
          healthy = true;
          break;
        }
      } catch {
        // The listener can refuse requests until schema initialization completes.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    pass(healthy, 'production server starts with a valid PostgreSQL DATABASE_URL and /health returns 200');
    if (!healthy) throw new Error(`Production startup probe failed. Child output:\n${output}`);

    child.kill('SIGTERM');
    const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Production server did not exit after SIGTERM within 12 seconds.')), 12_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    pass(closed.code === 0 && output.includes('Database connections closed.'), 'production server closes its database pool and exits 0 after SIGTERM');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }
}

async function resetDisposablePostgresSchema(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  // This destructive reset is reachable only after the test-database/host guard.
  const rawPool = new Pool({ connectionString: databaseUrl, ssl: false, max: 1 });
  try {
    await rawPool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await rawPool.query('CREATE SCHEMA public');
  } finally {
    await rawPool.end();
  }
}

function verifyDestructiveTargetGuardCases(): void {
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    ALLOW_DESTRUCTIVE_POSTGRES_TESTS: 'YES',
  };
  for (const rejectedName of ['campusfind_latest', 'prod_testimonials']) {
    let refused = false;
    try {
      validateDestructivePostgresTarget({ ...baseEnv, DATABASE_URL: `postgresql://user:pw@localhost:5432/${rejectedName}` });
    } catch (error) {
      refused = error instanceof Error && error.message.includes('whole name segment');
    }
    pass(refused, `destructive Postgres guard refuses database '${rejectedName}'`);
  }
  validateDestructivePostgresTarget({ ...baseEnv, DATABASE_URL: 'postgresql://user:pw@localhost:5432/campusfind_test' });
  pass(true, 'destructive Postgres guard allows local database campusfind_test');
}

async function run(): Promise<void> {
  verifyDestructiveTargetGuardCases();
  validateDestructivePostgresTarget();
  if (!isPostgresMode()) {
    throw new Error('Refusing destructive PostgreSQL test: DATABASE_URL is not configured for PostgreSQL.');
  }

  try {
    // Start from a genuinely empty schema, then run ten independent application
    // processes at once. This reproduces concurrent deployment startup.
    await resetDisposablePostgresSchema();
    await runConcurrentStartupProbe('Empty database startup');

    let pool = await getPgPool();
    const indexAfterEmptyInit = await pool.query<{ index_name: string | null }>(
      `SELECT to_regclass('public.idx_claims_one_approved_per_item')::text AS index_name`
    );
    pass(Boolean(indexAfterEmptyInit.rows[0]?.index_name), 'empty schema initialization creates the partial unique index');

    await closeDatabase();
    await verifyStartupLockTimeoutAndRecovery();

    await resetDatabase();
    await seedUsers();
    await closeDatabase();
    await runConcurrentStartupProbe('Initialized database startup');
    pool = await getPgPool();
    await resetDatabase();
    await seedUsers();

    // Simulate a prior app version that allowed duplicate approvals, then have
    // ten independent processes reconcile them concurrently during startup.
    const duplicateItem = await foundItem('R1 duplicate approvals');
    await execute(`UPDATE items SET status = 'MATCHED' WHERE id = ?`, [duplicateItem.id]);
    await execute(`DROP INDEX IF EXISTS idx_claims_one_approved_per_item`);
    const createdAt = new Date().toISOString();
    await execute(
      `INSERT INTO claims
       (id, item_id, claimant_id, message, verification_answer, handover_code,
        claimant_confirmed_at, finder_confirmed_at, status, moderator_note, created_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)`,
      ['pg_r1_unconfirmed_earlier', duplicateItem.id, 'pg_r1_claimant_a', 'test', 'answer', '111111', null, null, 'old note', createdAt, '2026-01-01T00:00:00.000Z']
    );
    await execute(
      `INSERT INTO claims
       (id, item_id, claimant_id, message, verification_answer, handover_code,
        claimant_confirmed_at, finder_confirmed_at, status, moderator_note, created_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)`,
      ['pg_r1_confirmed_later', duplicateItem.id, 'pg_r1_claimant_b', 'test', 'answer', '222222', createdAt, createdAt, null, createdAt, '2026-01-04T00:00:00.000Z']
    );

    await closeDatabase();
    await runConcurrentStartupProbe('Duplicate approvals database startup');
    pool = await getPgPool();
    const approved = await query<{ id: string }>(
      `SELECT id FROM claims WHERE item_id = ? AND status = 'APPROVED'`,
      [duplicateItem.id]
    );
    const resetClaim = await queryOne<{
      status: string; handover_code: string | null; claimant_confirmed_at: string | null;
      finder_confirmed_at: string | null; moderator_note: string | null;
    }>(`SELECT status, handover_code, claimant_confirmed_at, finder_confirmed_at, moderator_note FROM claims WHERE id = ?`, ['pg_r1_unconfirmed_earlier']);
    const resetAudit = await query<{ id: string }>(
      `SELECT id FROM audit_logs WHERE action = 'CLAIM_DUPLICATE_APPROVAL_RESET' AND target = ?`,
      [`Claim pg_r1_unconfirmed_earlier on item ${duplicateItem.id}`]
    );
    const statusAfterMigration = await queryOne<{ status: string }>(`SELECT status FROM items WHERE id = ?`, [duplicateItem.id]);
    const duplicateIndex = await queryOne<{ index_name: string | null }>(`SELECT to_regclass('public.idx_claims_one_approved_per_item')::text AS index_name`);
    pass(approved.length === 1 && approved[0].id === 'pg_r1_confirmed_later', 'parallel startup keeps the fully confirmed claim and exactly one approval');
    pass(resetClaim?.status === 'PENDING' && resetClaim.handover_code === null && resetClaim.claimant_confirmed_at === null && resetClaim.finder_confirmed_at === null && Boolean(resetClaim.moderator_note?.includes('Auto-reset: duplicate approval detected during migration')), 'duplicate loser is reset and all handover fields are cleared with a note');
    pass(resetAudit.length === 1, 'concurrent startup writes exactly one duplicate-reset audit row');
    pass(statusAfterMigration?.status === 'MATCHED', 'migration leaves the item status unchanged');
    pass(Boolean(duplicateIndex?.index_name), 'partial unique index exists after duplicate cleanup');

    await closeDatabase();
    await runConcurrentStartupProbe('Second duplicate approvals database startup');
    pool = await getPgPool();
    const approvedSecondStart = await query<{ id: string }>(`SELECT id FROM claims WHERE item_id = ? AND status = 'APPROVED'`, [duplicateItem.id]);
    const auditSecondStart = await query<{ id: string }>(`SELECT id FROM audit_logs WHERE action = 'CLAIM_DUPLICATE_APPROVAL_RESET' AND target = ?`, [`Claim pg_r1_unconfirmed_earlier on item ${duplicateItem.id}`]);
    pass(approvedSecondStart.length === 1 && approvedSecondStart[0].id === 'pg_r1_confirmed_later' && auditSecondStart.length === 1, 'repeated parallel startups are idempotent and do not add audit rows');

    // Guarded concurrent approvals: exactly one should commit, with the losing duplicate-key error normalized.
    await resetDatabase();
    await seedUsers();
    const approvalItem = await foundItem('R1 concurrent approvals');
    const pendingClaims = await Promise.all([
      createClaim(approvalItem.id, 'pg_r1_claimant_a', 'claim A', 'R1 private verification detail'),
      createClaim(approvalItem.id, 'pg_r1_claimant_b', 'claim B', 'R1 private verification detail'),
    ]);
    const approvalResults = await Promise.allSettled(pendingClaims.map((claim) => approveClaim(claim.id, 'pg_r1_moderator')));
    const approvedCount = await queryOne<{ count: number | string }>(`SELECT COUNT(*) AS count FROM claims WHERE item_id = ? AND status = 'APPROVED'`, [approvalItem.id]);
    const rejectedApproval = approvalResults.find((result) => result.status === 'rejected');
    const normalizedDuplicateError = rejectedApproval?.status === 'rejected' && rejectedApproval.reason instanceof Error && rejectedApproval.reason.message === 'Another claim for this item is already approved.';
    pass(approvalResults.filter((result) => result.status === 'fulfilled').length === 1 && Number(approvedCount?.count) === 1, 'Promise.all approvals produce exactly one APPROVED claim and one rejected call');
    pass(normalizedDuplicateError, 'approveClaim recognizes and normalizes PostgreSQL duplicate-key/guarded-update errors');

    // Two independent parties confirm concurrently; only the RESOLVED transition owns side effects.
    await resetDatabase();
    await seedUsers();
    const handoverItem = await foundItem('R1 concurrent handover');
    const handoverClaim = await createClaim(handoverItem.id, 'pg_r1_claimant_a', 'return this item', 'R1 private verification detail');
    const approvedHandover = await approveClaim(handoverClaim.id, 'pg_r1_moderator');
    await Promise.all([
      confirmHandover(handoverClaim.id, 'pg_r1_claimant_a'),
      confirmHandover(handoverClaim.id, 'pg_r1_finder', approvedHandover.handover_code || ''),
    ]);
    const handoverTarget = `Claim ${handoverClaim.id} on item ${handoverItem.id}`;
    const completionAudits = await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'HANDOVER_COMPLETED' AND target = ?`, [handoverTarget]);
    const completionNotifications = await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM notifications WHERE title = 'Item Return Completed' AND (user_id = ? OR user_id = ?)`, ['pg_r1_claimant_a', 'pg_r1_finder']);
    const resolved = await queryOne<{ status: string }>(`SELECT status FROM items WHERE id = ?`, [handoverItem.id]);
    pass(Number(completionAudits[0]?.count) === 1 && Number(completionNotifications[0]?.count) === 2 && resolved?.status === 'RESOLVED', 'Promise.all final handover confirms produce one audit row, two notifications, and RESOLVED');

    await resetDatabase();
    await closeDatabase();
    await verifyProductionServerStartupAndGracefulShutdown();
    console.log('PostgreSQL R1 integration checks complete. Test database was truncated at the end.');
  } catch (err) {
    await closeDatabase().catch(() => {});
    throw err;
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
