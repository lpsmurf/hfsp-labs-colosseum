import Database from 'better-sqlite3';
import path from 'path';
import type { Agent, Skill, X402Transaction } from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'x402-wallet.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      walletAddress TEXT NOT NULL UNIQUE,
      status       TEXT NOT NULL DEFAULT 'active',
      description  TEXT,
      createdAt    INTEGER NOT NULL,
      updatedAt    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id               TEXT PRIMARY KEY,
      agentId          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      product          TEXT NOT NULL,
      name             TEXT NOT NULL,
      enabled          INTEGER NOT NULL DEFAULT 1,
      spendCapUsdc     REAL NOT NULL DEFAULT 10,
      autoApproveUsdc  REAL NOT NULL DEFAULT 1,
      periodSeconds    INTEGER NOT NULL DEFAULT 86400,
      createdAt        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY,
      agentId     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      signature   TEXT NOT NULL UNIQUE,
      product     TEXT NOT NULL DEFAULT 'unknown',
      endpoint    TEXT NOT NULL DEFAULT '',
      amountUsdc  REAL NOT NULL,
      status      TEXT NOT NULL DEFAULT 'success',
      blockTime   INTEGER NOT NULL,
      meta        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_txs_agent ON transactions(agentId);
    CREATE INDEX IF NOT EXISTS idx_txs_blocktime ON transactions(blockTime DESC);
    CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills(agentId);
  `);
}

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

export function listAgents(): Agent[] {
  return getDb().prepare('SELECT * FROM agents ORDER BY createdAt DESC').all() as Agent[];
}

export function getAgent(id: string): Agent | null {
  return (getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent) ?? null;
}

export function upsertAgent(agent: Omit<Agent, 'createdAt' | 'updatedAt'>): Agent {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO agents (id, name, walletAddress, status, description, createdAt, updatedAt)
    VALUES (@id, @name, @walletAddress, @status, @description, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      description = excluded.description,
      updatedAt = excluded.updatedAt
  `).run({ ...agent, now });
  return getAgent(agent.id)!;
}

export function setAgentStatus(id: string, status: Agent['status']): void {
  getDb().prepare('UPDATE agents SET status = ?, updatedAt = ? WHERE id = ?').run(status, Date.now(), id);
}

// ─── Skill CRUD ───────────────────────────────────────────────────────────────

export function listSkills(agentId: string): Skill[] {
  return getDb().prepare('SELECT * FROM skills WHERE agentId = ? ORDER BY createdAt').all(agentId) as Skill[];
}

export function upsertSkill(skill: Omit<Skill, 'createdAt'>): Skill {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO skills (id, agentId, product, name, enabled, spendCapUsdc, autoApproveUsdc, periodSeconds, createdAt)
    VALUES (@id, @agentId, @product, @name, @enabled, @spendCapUsdc, @autoApproveUsdc, @periodSeconds, @now)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      spendCapUsdc = excluded.spendCapUsdc,
      autoApproveUsdc = excluded.autoApproveUsdc,
      periodSeconds = excluded.periodSeconds
  `).run({ ...skill, enabled: skill.enabled ? 1 : 0, now });
  return getDb().prepare('SELECT * FROM skills WHERE id = ?').get(skill.id) as Skill;
}

export function toggleSkill(id: string, enabled: boolean): void {
  getDb().prepare('UPDATE skills SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

// ─── Transaction CRUD ─────────────────────────────────────────────────────────

export function listTransactions(agentId?: string, limit = 100): X402Transaction[] {
  const q = agentId
    ? 'SELECT * FROM transactions WHERE agentId = ? ORDER BY blockTime DESC LIMIT ?'
    : 'SELECT * FROM transactions ORDER BY blockTime DESC LIMIT ?';
  const params = agentId ? [agentId, limit] : [limit];
  return getDb().prepare(q).all(...params) as X402Transaction[];
}

export function insertTransaction(tx: X402Transaction): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO transactions (id, agentId, signature, product, endpoint, amountUsdc, status, blockTime, meta)
    VALUES (@id, @agentId, @signature, @product, @endpoint, @amountUsdc, @status, @blockTime, @meta)
  `).run(tx);
}

export function getSpendSummary(agentId: string): { totalUsdc: number; txCount: number; last30DaysUsdc: number } {
  const db = getDb();
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const { total, count } = db.prepare(
    "SELECT COALESCE(SUM(amountUsdc),0) as total, COUNT(*) as count FROM transactions WHERE agentId = ? AND status = 'success'"
  ).get(agentId) as { total: number; count: number };
  const { last30 } = db.prepare(
    "SELECT COALESCE(SUM(amountUsdc),0) as last30 FROM transactions WHERE agentId = ? AND status = 'success' AND blockTime > ?"
  ).get(agentId, cutoff) as { last30: number };
  return { totalUsdc: total, txCount: count, last30DaysUsdc: last30 };
}
