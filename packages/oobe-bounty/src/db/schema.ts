import fs from 'node:fs';
import path from 'node:path';
import DatabaseConstructor, { type Database } from 'better-sqlite3';

export async function initializeDatabase(dbPath: string): Promise<Database> {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseConstructor(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  await migrateDatabase(db);
  return db;
}

export async function migrateDatabase(db: Database): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      sap_id            TEXT,
      capabilities      TEXT NOT NULL,
      endpoint          TEXT NOT NULL,
      service           TEXT NOT NULL,
      running           INTEGER NOT NULL DEFAULT 0,
      last_signal_time  TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL,
      service       TEXT NOT NULL,
      tokens_used   INTEGER NOT NULL DEFAULT 0,
      sol_amount    REAL NOT NULL,
      tx_signature  TEXT,
      status        TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
      error         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at  TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS trading_signals (
      id                  TEXT PRIMARY KEY,
      agent_id            TEXT NOT NULL,
      service             TEXT NOT NULL,
      action              TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
      target_price        REAL NOT NULL,
      confidence          REAL NOT NULL,
      reason              TEXT NOT NULL,
      risk_level          TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
      actual_price        REAL NOT NULL,
      outcome_recorded    INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      outcome_at          TEXT,
      posted_to_twitter   INTEGER NOT NULL DEFAULT 0,
      posted_to_telegram  INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT,
      action      TEXT NOT NULL,
      details     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agents_running
      ON agents(running);
    CREATE INDEX IF NOT EXISTS idx_agents_last_signal_time
      ON agents(last_signal_time);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at
      ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_status
      ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_agent_service
      ON payments(agent_id, service);
    CREATE INDEX IF NOT EXISTS idx_trading_signals_created_at
      ON trading_signals(created_at);
    CREATE INDEX IF NOT EXISTS idx_trading_signals_outcome_recorded
      ON trading_signals(outcome_recorded);
    CREATE INDEX IF NOT EXISTS idx_trading_signals_agent_created
      ON trading_signals(agent_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
      ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_agent_action
      ON audit_log(agent_id, action);
  `);

  const columns = db.pragma(`table_info(trading_signals)`) as Array<{ name: string }>;
  if (!columns.find((c) => c.name === 'image_url')) {
    db.exec(`ALTER TABLE trading_signals ADD COLUMN image_url TEXT`);
  }
  if (!columns.find((c) => c.name === 'headlines')) {
    db.exec(`ALTER TABLE trading_signals ADD COLUMN headlines TEXT`);
  }
}
