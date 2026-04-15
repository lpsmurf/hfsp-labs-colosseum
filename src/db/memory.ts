import { logger } from '../utils/logger';
import { Deployment } from '../models/deployment';
import { Payment } from '../models/payment';

/**
 * In-memory store for deployments and payments
 * Will be replaced with PostgreSQL in Phase 2
 */

// Deployment storage
const deployments = new Map<string, Deployment>();

// Payment storage
const payments = new Map<string, Payment>();

// Legacy agent storage (for compatibility during migration)
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

const agents = new Map<string, DeployedAgent>();

// ============================================================================
// Deployment Operations
// ============================================================================

export function saveDeployment(deployment: Deployment): void {
  deployments.set(deployment.deployment_id, deployment);
  logger.info(
    { deployment_id: deployment.deployment_id, tier_id: deployment.tier_id },
    'Deployment saved to memory store'
  );
}

export function getDeployment(deployment_id: string): Deployment | null {
  return deployments.get(deployment_id) || null;
}

export function getDeploymentByAgentId(agent_id: string): Deployment | null {
  for (const deployment of deployments.values()) {
    if (deployment.agent_id === agent_id) return deployment;
  }
  return null;
}

export function listDeployments(wallet_address?: string): Deployment[] {
  const all = Array.from(deployments.values());
  if (wallet_address) {
    return all.filter(d => d.wallet_address === wallet_address);
  }
  return all;
}

export function updateDeploymentStatus(
  deployment_id: string,
  status: Deployment['status']
): boolean {
  const deployment = deployments.get(deployment_id);
  if (!deployment) return false;
  deployment.status = status;
  deployment.last_activity = new Date();
  logger.info({ deployment_id, status }, 'Deployment status updated');
  return true;
}

export function updateDeploymentEndpoint(
  deployment_id: string,
  endpoint: string
): boolean {
  const deployment = deployments.get(deployment_id);
  if (!deployment) return false;
  deployment.endpoint = endpoint;
  deployment.last_activity = new Date();
  logger.info({ deployment_id, endpoint }, 'Deployment endpoint updated');
  return true;
}

export function addDeploymentLog(
  deployment_id: string,
  level: 'info' | 'warn' | 'error',
  message: string
): boolean {
  const deployment = deployments.get(deployment_id);
  if (!deployment) return false;
  deployment.logs.push({
    timestamp: new Date(),
    level,
    message,
  });
  deployment.last_activity = new Date();
  return true;
}

export function deleteDeployment(deployment_id: string): boolean {
  const result = deployments.delete(deployment_id);
  if (result) {
    logger.info({ deployment_id }, 'Deployment deleted from memory store');
  }
  return result;
}

// ============================================================================
// Payment Operations
// ============================================================================

export function savePayment(payment: Payment): void {
  payments.set(payment.payment_id, payment);
  logger.info(
    { payment_id: payment.payment_id, wallet: payment.wallet_address },
    'Payment saved to memory store'
  );
}

export function getPayment(payment_id: string): Payment | null {
  return payments.get(payment_id) || null;
}

export function getPaymentByTxHash(tx_hash: string): Payment | null {
  for (const payment of payments.values()) {
    if (payment.tx_hash === tx_hash) return payment;
  }
  return null;
}

export function listPayments(wallet_address?: string): Payment[] {
  const all = Array.from(payments.values());
  if (wallet_address) {
    return all.filter(p => p.wallet_address === wallet_address);
  }
  return all;
}

export function updatePaymentStatus(
  payment_id: string,
  status: Payment['status'],
  tx_hash?: string
): boolean {
  const payment = payments.get(payment_id);
  if (!payment) return false;
  payment.status = status;
  if (status === 'confirmed') {
    payment.confirmed_at = new Date();
  }
  if (tx_hash) {
    payment.tx_hash = tx_hash;
  }
  logger.info({ payment_id, status }, 'Payment status updated');
  return true;
}

export function deletePayment(payment_id: string): boolean {
  const result = payments.delete(payment_id);
  if (result) {
    logger.info({ payment_id }, 'Payment deleted from memory store');
  }
  return result;
}

// ============================================================================
// Legacy Agent Operations (for compatibility)
// ============================================================================

export function saveAgent(agent: DeployedAgent): void {
  agents.set(agent.agent_id, agent);
  logger.info(
    { agent_id: agent.agent_id, service_id: agent.service_id },
    'Agent saved to memory store'
  );
}

export function getAgent(agent_id: string): DeployedAgent | null {
  return agents.get(agent_id) || null;
}

export function listAgents(owner_id?: string): DeployedAgent[] {
  const allAgents = Array.from(agents.values());
  if (owner_id) {
    return allAgents.filter(a => a.owner_id === owner_id);
  }
  return allAgents;
}

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

export function deleteAgent(agent_id: string): boolean {
  const result = agents.delete(agent_id);
  if (result) {
    logger.info({ agent_id }, 'Agent deleted from memory store');
  }
  return result;
}

export function clearAllAgents(): void {
  agents.clear();
  logger.warn('All agents cleared from memory store');
}

// ============================================================================
// Statistics
// ============================================================================

export function getStats() {
  const allAgents = Array.from(agents.values());
  const allDeployments = Array.from(deployments.values());
  const allPayments = Array.from(payments.values());

  const deploymentsByStatus = {
    provisioning: allDeployments.filter(d => d.status === 'provisioning').length,
    running: allDeployments.filter(d => d.status === 'running').length,
    paused: allDeployments.filter(d => d.status === 'paused').length,
    failed: allDeployments.filter(d => d.status === 'failed').length,
    stopped: allDeployments.filter(d => d.status === 'stopped').length,
  };

  const paymentsByStatus = {
    pending: allPayments.filter(p => p.status === 'pending').length,
    confirmed: allPayments.filter(p => p.status === 'confirmed').length,
    failed: allPayments.filter(p => p.status === 'failed').length,
  };

  return {
    deployments: {
      total: allDeployments.length,
      by_status: deploymentsByStatus,
    },
    payments: {
      total: allPayments.length,
      by_status: paymentsByStatus,
    },
    agents: {
      total: allAgents.length,
    },
  };
}

export function clearAllStores(): void {
  deployments.clear();
  payments.clear();
  agents.clear();
  logger.warn('All stores cleared');
}
