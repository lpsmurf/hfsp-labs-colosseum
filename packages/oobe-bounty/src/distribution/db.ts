import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TradingSignal } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../data/bounty-vault.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    ensureSchema();
  }
  return db;
}

function ensureSchema() {
  if (!db) return;

  // Add missing columns if they don't exist (idempotent)
  const columns = db.prepare("PRAGMA table_info(trading_signals)").all() as any[];
  const colNames = columns.map((c) => c.name);

  if (!colNames.includes('twitter_post_id')) {
    db.exec('ALTER TABLE trading_signals ADD COLUMN twitter_post_id TEXT');
  }
  if (!colNames.includes('telegram_message_id')) {
    db.exec('ALTER TABLE trading_signals ADD COLUMN telegram_message_id TEXT');
  }
  if (!colNames.includes('post_error')) {
    db.exec('ALTER TABLE trading_signals ADD COLUMN post_error TEXT');
  }
}

export function getUnpostedSignals(platform: 'twitter' | 'telegram'): TradingSignal[] {
  const db = getDb();
  const column = platform === 'twitter' ? 'posted_to_twitter' : 'posted_to_telegram';
  const stmt = db.prepare(
    `SELECT * FROM trading_signals WHERE ${column} = 0 ORDER BY created_at ASC`
  );
  const rows = stmt.all() as any[];
  return rows.map(normalizeSignal);
}

export function markSignalPosted(
  id: string,
  platform: 'twitter' | 'telegram',
  postId: string
): void {
  const db = getDb();
  const column = platform === 'twitter' ? 'posted_to_twitter' : 'posted_to_telegram';
  const idColumn = platform === 'twitter' ? 'twitter_post_id' : 'telegram_message_id';
  const stmt = db.prepare(
    `UPDATE trading_signals SET ${column} = 1, ${idColumn} = ?, post_error = NULL WHERE id = ?`
  );
  stmt.run(postId, id);
}

export function markSignalError(id: string, error: string): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE trading_signals SET post_error = ? WHERE id = ?');
  stmt.run(error, id);
}

export function getSignalCount(): { total: number; twitter: number; telegram: number } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM trading_signals').get() as any).c;
  const twitter = (
    db.prepare('SELECT COUNT(*) as c FROM trading_signals WHERE posted_to_twitter = 1').get() as any
  ).c;
  const telegram = (
    db.prepare('SELECT COUNT(*) as c FROM trading_signals WHERE posted_to_telegram = 1').get() as any
  ).c;
  return { total, twitter, telegram };
}

export function insertMockSignal(signal: Partial<TradingSignal>): TradingSignal {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO trading_signals (
      id, agent_id, service, action, target_price, confidence,
      reason, risk_level, actual_price, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const id = signal.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  stmt.run(
    id,
    signal.agent_id || 'price-monitor',
    signal.service || 'price-feed',
    signal.action || 'BUY',
    signal.target_price || 42.5,
    signal.confidence || 0.85,
    signal.reason || 'Price up 5%+ in last hour + positive sentiment spike',
    signal.risk_level || 'LOW',
    signal.actual_price || 42.0,
    signal.created_at || new Date().toISOString()
  );
  return getSignalById(id)!;
}

export function getSignalById(id: string): TradingSignal | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM trading_signals WHERE id = ?').get(id) as any;
  return row ? normalizeSignal(row) : null;
}

function normalizeSignal(row: any): TradingSignal {
  return {
    ...row,
    outcome_recorded: Boolean(row.outcome_recorded),
    posted_to_twitter: Boolean(row.posted_to_twitter),
    posted_to_telegram: Boolean(row.posted_to_telegram),
  };
}
