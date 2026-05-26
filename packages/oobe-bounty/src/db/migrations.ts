import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { AGENT_DEFINITIONS } from '../config.js';
import type { AgentDefinition, TradingSignal } from '../types.js';

export function seedAgents(db: Database): void {
  const stmt = db.prepare(`
    INSERT INTO agents (id, name, sap_id, capabilities, endpoint, service, running, created_at, updated_at)
    VALUES (@id, @name, NULL, @capabilities, @endpoint, @service, 0, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      capabilities = excluded.capabilities,
      endpoint = excluded.endpoint,
      service = excluded.service,
      updated_at = datetime('now')
  `);

  const tx = db.transaction((agents: AgentDefinition[]) => {
    for (const agent of agents) {
      stmt.run({
        id: agent.id,
        name: agent.name,
        capabilities: JSON.stringify(agent.capabilities),
        endpoint: agent.endpoint,
        service: agent.service,
      });
    }
  });

  tx(AGENT_DEFINITIONS);
}

export function setAgentSapId(db: Database, agentId: string, sapId: string): void {
  db.prepare(`
    UPDATE agents
    SET sap_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sapId, agentId);
}

export function setAgentRunning(db: Database, agentId: string, running: boolean): void {
  db.prepare(`
    UPDATE agents
    SET running = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(running ? 1 : 0, agentId);
}

export function insertSignal(db: Database, signal: TradingSignal): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO trading_signals (
      id, agent_id, service, action, target_price, confidence, reason,
      risk_level, actual_price, outcome_recorded, created_at, image_url, headlines
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    signal.agentId,
    signal.service,
    signal.action,
    signal.target_price,
    signal.confidence,
    signal.reason,
    signal.risk_level,
    signal.actual_price,
    signal.timestamp,
    signal.image_url ?? null,
    signal.headlines ? JSON.stringify(signal.headlines) : null,
  );

  db.prepare(`
    UPDATE agents
    SET last_signal_time = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(signal.timestamp, signal.agentId);

  return id;
}

export function logAuditEvent(
  db: Database,
  agentId: string | null,
  action: string,
  details: Record<string, unknown>,
): void {
  db.prepare(`
    INSERT INTO audit_log (id, agent_id, action, details, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(randomUUID(), agentId, action, JSON.stringify(redactDetails(details)));
}

function redactDetails(details: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (/key|secret|token|private|authorization/i.test(key)) {
      redacted[key] = '[redacted]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
