import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.TRIAL_DB_PATH ?? process.env.SQLITE_PATH ?? path.join(__dirname, '../data/quota.sqlite');

const LIMIT = parseInt(process.env.TRIAL_MESSAGES_PER_IP_PER_DAY ?? '10', 10);

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS quotas (
        ip TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        day TEXT NOT NULL
      )
    `);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        email TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resets_at: string;
}

// AUDIT: HIGH — Rate limiting is scoped by IP address only. A client can bypass the
// limit by rotating IPs (VPN, proxy pool, Tor). Consider adding wallet-signature-based
// rate limiting for authenticated endpoints, or at least a secondary per-session limit
// using the sessionId from the trial chat.
export function checkAndIncrement(ip: string): QuotaResult {
  const d = today();
  const resets_at = `${d}T23:59:59Z`;

  const row = db().prepare('SELECT count, day FROM quotas WHERE ip = ?').get(ip) as
    | { count: number; day: string }
    | undefined;

  if (!row || row.day !== d) {
    db().prepare('INSERT OR REPLACE INTO quotas (ip, count, day) VALUES (?, 1, ?)').run(ip, d);
    return { allowed: true, remaining: LIMIT - 1, resets_at };
  }

  if (row.count >= LIMIT) {
    return { allowed: false, remaining: 0, resets_at };
  }

  db().prepare('UPDATE quotas SET count = count + 1 WHERE ip = ?').run(ip);
  return { allowed: true, remaining: LIMIT - row.count - 1, resets_at };
}

export function getQuota(ip: string): { used: number; limit: number; remaining: number; resets_at: string } {
  const d = today();
  const row = db().prepare('SELECT count, day FROM quotas WHERE ip = ?').get(ip) as
    | { count: number; day: string }
    | undefined;

  const used = row && row.day === d ? row.count : 0;
  return {
    used,
    limit: LIMIT,
    remaining: Math.max(LIMIT - used, 0),
    resets_at: `${d}T23:59:59Z`,
  };
}

export function saveEmail(ip: string, email: string): void {
  try {
    db().prepare('INSERT OR IGNORE INTO leads (email, ip) VALUES (?, ?)').run(
      email.toLowerCase().trim(),
      ip
    );
  } catch { /* ignore duplicate */ }
}

export function getLeads(): { email: string; ip: string; created_at: string }[] {
  return db().prepare('SELECT email, ip, created_at FROM leads ORDER BY created_at DESC').all() as
    { email: string; ip: string; created_at: string }[];
}
