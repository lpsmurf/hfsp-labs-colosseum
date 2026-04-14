import { logger } from '../utils/logger';

/**
 * In-memory store for deployed agents
 * Will be replaced with PostgreSQL in later phases
 */

export interface DeployedAgent {
  agent_id: string;
  service_id: string;
  agent_name: string;
  owner_id?: string;
  payment_tx_hash: string;
  status: 'provisioning' | 'running' | 'paused' | 'failed' | 'stopped';
  console_url?: string;
  deployed_at: Date;
  last_activity: Date;
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
}

// In-memory storage
const agents = new Map<string, DeployedAgent>();

/**
 * Save or update an agent
 */
export function saveAgent(agent: DeployedAgent): void {
  agents.set(agent.agent_id, agent);
  logger.info(
    { agent_id: agent.agent_id, service_id: agent.service_id },
    'Agent saved to memory store'
  );
}

/**
 * Get agent by ID
 */
export function getAgent(agent_id: string): DeployedAgent | null {
  return agents.get(agent_id) || null;
}

/**
 * List all agents (optionally filtered by owner)
 */
export function listAgents(owner_id?: string): DeployedAgent[] {
  const allAgents = Array.from(agents.values());
  if (owner_id) {
    return allAgents.filter(a => a.owner_id === owner_id);
  }
  return allAgents;
}

/**
 * Update agent status
 */
export function updateAgentStatus(
  agent_id: string,
  status: DeployedAgent['status']
): boolean {
  const agent = agents.get(agent_id);
  if (!agent) return false;
  agent.status = status;
  agent.last_activity = new Date();
  logger.info({ agent_id, status }, 'Agent status updated');
  return true;
}

/**
 * Add log entry to agent
 */
export function addAgentLog(
  agent_id: string,
  level: 'info' | 'warn' | 'error',
  message: string
): boolean {
  const agent = agents.get(agent_id);
  if (!agent) return false;
  agent.logs.push({
    timestamp: new Date(),
    level,
    message,
  });
  agent.last_activity = new Date();
  return true;
}

/**
 * Delete agent
 */
export function deleteAgent(agent_id: string): boolean {
  const result = agents.delete(agent_id);
  if (result) {
    logger.info({ agent_id }, 'Agent deleted from memory store');
  }
  return result;
}

/**
 * Clear all agents (for testing)
 */
export function clearAllAgents(): void {
  agents.clear();
  logger.warn('All agents cleared from memory store');
}

/**
 * Get statistics about stored agents
 */
export function getStats() {
  const allAgents = Array.from(agents.values());
  const byStatus = {
    provisioning: allAgents.filter(a => a.status === 'provisioning').length,
    running: allAgents.filter(a => a.status === 'running').length,
    paused: allAgents.filter(a => a.status === 'paused').length,
    failed: allAgents.filter(a => a.status === 'failed').length,
    stopped: allAgents.filter(a => a.status === 'stopped').length,
  };
  return {
    total_agents: allAgents.length,
    by_status: byStatus,
    oldest_agent: allAgents.length > 0
      ? Math.min(...allAgents.map(a => a.deployed_at.getTime()))
      : null,
  };
}
