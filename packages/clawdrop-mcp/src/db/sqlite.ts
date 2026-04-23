// STREAM 2: Database & Idempotency (Gemini)
// Status: STUB - Ready for implementation
// Tasks: 2.1 (SQLite migration), 2.2 (Idempotency), 2.3 (Atomic tier limits)

import Database from 'better-sqlite3';
import crypto from 'crypto';

const db = new Database(process.env.DB_PATH || './agents.db');

// Enable optimizations
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// TODO: Create tables schema
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    deployment_id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    tier_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    telegram_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'provisioning',
    endpoint TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_wallet_tier ON agents(wallet_address, tier_id);
  CREATE INDEX IF NOT EXISTS idx_status ON agents(status);

  CREATE TABLE IF NOT EXISTS deployment_attempts (
    wallet_address TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

export function saveAgent(agent: any) {
  // TODO: Task 2.1 - Implement saveAgent CRUD
  const stmt = db.prepare(`
    INSERT INTO agents 
    (deployment_id, idempotency_key, tier_id, wallet_address, agent_id, agent_name, telegram_token, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(agent.deployment_id, agent.idempotency_key, agent.tier_id, agent.wallet_address, 
           agent.agent_id, agent.agent_name, agent.telegram_token, agent.status);
}

export function getAgentByIdempotencyKey(key: string): any | undefined {
  // TODO: Task 2.2 - Implement idempotency key lookup
  const stmt = db.prepare('SELECT * FROM agents WHERE idempotency_key = ?');
  return stmt.get(key);
}

export function checkAndIncrementTierCount(wallet_address: string, tier_id: string, max_agents: number): boolean {
  // TODO: Task 2.3 - Implement atomic tier limit check
  // Use db.transaction() for atomicity
  return true; // Placeholder
}

export function getAgent(deployment_id: string): any | undefined {
  const stmt = db.prepare('SELECT * FROM agents WHERE deployment_id = ?');
  return stmt.get(deployment_id);
}

export function countAgentsByWalletAndTier(wallet_address: string, tier_id: string): number {
  const stmt = db.prepare(
    'SELECT COUNT(*) as count FROM agents WHERE wallet_address = ? AND tier_id = ? AND status != "failed"'
  );
  const result = stmt.get(wallet_address, tier_id) as any;
  return result.count;
}

export function updateAgentStatus(deployment_id: string, status: string) {
  const stmt = db.prepare('UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE deployment_id = ?');
  stmt.run(status, deployment_id);
}

export function recordDeploymentAttempt(wallet_address: string): number {
  // TODO: Task 4.2 - Rate limiting (Kimi)
  return 0; // Placeholder
}
