import crypto from 'crypto';
import { execute, query } from '../database.js';
import { AuditLog } from '../models/types.js';

export async function logAudit(
  action: string,
  moderatorId: string,
  target: string,
  note?: string
): Promise<AuditLog> {
  const id = 'audit_' + crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await execute(
    `INSERT INTO audit_logs (id, action, moderator_id, target, timestamp, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, action, moderatorId, target, timestamp, note || null]
  );

  return {
    id,
    action,
    moderator_id: moderatorId,
    target,
    timestamp,
    note: note || null,
  };
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  return query<AuditLog>(
    `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`,
    [limit]
  );
}
