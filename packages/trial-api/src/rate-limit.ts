import { db } from './db.js';
import { env } from './env.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS quotas (
    ip TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    day TEXT NOT NULL
  );
`);

const checkStmt = db.prepare(
  'SELECT count FROM quotas WHERE ip = ? AND day = ?'
);
const incrementStmt = db.prepare(
  'INSERT INTO quotas (ip, count, day) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET count = count + 1'
);
const resetStmt = db.prepare('UPDATE quotas SET count = 1, day = ? WHERE ip = ?');

export function getUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkAndIncrement(ip: string): { allowed: boolean; remaining: number; used: number } {
  const day = getUtcDate();
  const limit = env.TRIAL_MESSAGES_PER_IP_PER_DAY;

  const row = checkStmt.get(ip, day) as { count: number } | undefined;

  if (!row) {
    // First time today
    incrementStmt.run(ip, day);
    return { allowed: true, remaining: limit - 1, used: 1 };
  }

  if (row.count >= limit) {
    return { allowed: false, remaining: 0, used: row.count };
  }

  incrementStmt.run(ip, day);
  return { allowed: true, remaining: limit - row.count - 1, used: row.count + 1 };
}

export function getQuota(ip: string): { used: number; limit: number; resetsAt: string } {
  const day = getUtcDate();
  const limit = env.TRIAL_MESSAGES_PER_IP_PER_DAY;
  const row = checkStmt.get(ip, day) as { count: number } | undefined;
  const used = row?.count ?? 0;

  // Next UTC midnight
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const resetsAt = tomorrow.toISOString();

  return { used, limit, resetsAt };
}
