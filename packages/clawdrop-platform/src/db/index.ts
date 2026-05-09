import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SQLITE_PATH ?? path.join(__dirname, '../../data/clawdrop.sqlite');

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      telegram_id TEXT UNIQUE,
      wallet_address TEXT,
      tier TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      tier TEXT NOT NULL,
      payment_token TEXT NOT NULL,
      amount_per_month TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_period_start TEXT,
      current_period_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
      tx_signature TEXT UNIQUE NOT NULL,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'deploying',
      deploy_type TEXT NOT NULL DEFAULT 'docker',
      container_id TEXT,
      mcp_port INTEGER,
      agent_port INTEGER,
      llm_provider TEXT NOT NULL,
      llm_model TEXT,
      custom_endpoint TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      agent_id TEXT REFERENCES agents(id),
      month TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, month)
    );

    CREATE TABLE IF NOT EXISTS telegram_pairings (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      pair_code TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      chat_id INTEGER,
      paired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Backfill existing tables that may be missing new columns
  try { db.exec(`ALTER TABLE telegram_pairings ADD COLUMN chat_id INTEGER;`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE telegram_pairings ADD COLUMN paired_at TEXT;`); } catch { /* already exists */ }

  // Onboarding columns — added for Poly email-gate (2026-05-09)
  try { db.exec(`ALTER TABLE telegram_pairings ADD COLUMN onboarding_state TEXT NOT NULL DEFAULT 'not_started';`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE telegram_pairings ADD COLUMN email TEXT;`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE telegram_pairings ADD COLUMN onboarded_at TEXT;`); } catch { /* already exists */ }

  // Unique index on email — one email per Poly agent (skip if already exists)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pairings_email ON telegram_pairings(email) WHERE email IS NOT NULL;`);
  } catch { /* already exists */ }
}
