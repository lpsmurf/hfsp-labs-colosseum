import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type SessionRow = {
  id: string;
  token: string;
  expires_at: string;
  duration_hours: number;
  tx_signature: string;
  usdc_paid: number;
  created_at: string;
  bytes_transferred: number;
};

export function openDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      token         TEXT UNIQUE NOT NULL,
      expires_at    TEXT NOT NULL,
      duration_hours INTEGER NOT NULL,
      tx_signature  TEXT NOT NULL,
      usdc_paid     REAL NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      bytes_transferred INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}

export function createSession(
  db: Database.Database,
  token: string,
  durationHours: number,
  txSignature: string,
  usdcPaid: number,
): SessionRow {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + durationHours * 3_600_000).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, token, expires_at, duration_hours, tx_signature, usdc_paid)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, token, expiresAt, durationHours, txSignature, usdcPaid);
  return db.prepare(`SELECT * FROM sessions WHERE id=?`).get(id) as SessionRow;
}

export function validateSession(db: Database.Database, token: string): SessionRow | null {
  const row = db.prepare(`
    SELECT * FROM sessions WHERE token=? AND expires_at > datetime('now')
  `).get(token) as SessionRow | undefined;
  return row ?? null;
}

export function addBytes(db: Database.Database, token: string, bytes: number): void {
  db.prepare(
    `UPDATE sessions SET bytes_transferred = bytes_transferred + ? WHERE token=?`,
  ).run(bytes, token);
}

export function getStats(db: Database.Database) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total_sessions,
      SUM(CASE WHEN expires_at > datetime('now') THEN 1 ELSE 0 END) AS active_sessions,
      COALESCE(SUM(usdc_paid), 0) AS total_usdc,
      COALESCE(SUM(bytes_transferred), 0) AS total_bytes
    FROM sessions
  `).get() as { total_sessions: number; active_sessions: number; total_usdc: number; total_bytes: number };
}
