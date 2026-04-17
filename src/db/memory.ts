import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'provisioning' | 'running' | 'paused' | 'failed' | 'stopped';
export type PaymentToken = 'SOL' | 'USDT' | 'USDC' | 'HERD';
export type BundleName = 'solana' | 'research' | 'treasury' | 'travel-crypto-pro';

export interface PaymentRecord {
  payment_id: string;
  amount: number;
  token: PaymentToken;
  tx_hash: string;
  timestamp: Date;
  fee_charged_usd: number;
  jupiter_swap: boolean; // true if token was swapped via Jupiter
}

export interface Subscription {
  tier_id: string;
  amount_usd: number;
  payment_token: PaymentToken;
  started_at: Date;
  next_payment_due: Date;
  grace_period_end: Date | null;
  payment_history: PaymentRecord[];
}

export interface DeployedAgent {
  agent_id: string;
  tier_id: string;
  agent_name: string;
  owner_wallet: string;
  bundles: BundleName[];
  status: AgentStatus;
  vps_ip?: string;
  console_url?: string;
  deployed_at: Date;
  last_activity: Date;
  subscription: Subscription;
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
  is_public?: boolean;
  public_description?: string;
  tags?: string[];
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const agents = new Map<string, DeployedAgent>();

// ─── JSON backup ──────────────────────────────────────────────────────────────

const BACKUP_FILE = path.join(process.cwd(), 'data', 'agents.json');

function ensureDataDir() {
  const dir = path.dirname(BACKUP_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function serializeAgent(agent: DeployedAgent): object {
  return {
    ...agent,
    deployed_at: agent.deployed_at.toISOString(),
    last_activity: agent.last_activity.toISOString(),
    subscription: {
      ...agent.subscription,
      started_at: agent.subscription.started_at.toISOString(),
      next_payment_due: agent.subscription.next_payment_due.toISOString(),
      grace_period_end: agent.subscription.grace_period_end?.toISOString() ?? null,
      payment_history: agent.subscription.payment_history.map(p => ({
        ...p,
        timestamp: p.timestamp.toISOString(),
      })),
    },
    logs: agent.logs.map(l => ({ ...l, timestamp: l.timestamp.toISOString() })),
  };
}

function deserializeAgent(raw: any): DeployedAgent {
  return {
    ...raw,
    deployed_at: new Date(raw.deployed_at),
    last_activity: new Date(raw.last_activity),
    subscription: {
      ...raw.subscription,
      started_at: new Date(raw.subscription.started_at),
      next_payment_due: new Date(raw.subscription.next_payment_due),
      grace_period_end: raw.subscription.grace_period_end
        ? new Date(raw.subscription.grace_period_end)
        : null,
      payment_history: (raw.subscription.payment_history || []).map((p: any) => ({
        ...p,
        timestamp: new Date(p.timestamp),
      })),
    },
    logs: (raw.logs || []).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })),
  };
}

export function persistToDisk(): void {
  try {
    ensureDataDir();
    const data = Array.from(agents.values()).map(serializeAgent);
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error(err, 'Failed to persist agents to disk');
  }
}

export function loadFromDisk(): void {
  try {
    if (!fs.existsSync(BACKUP_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
    for (const item of raw) {
      const agent = deserializeAgent(item);
      agents.set(agent.agent_id, agent);
    }
    logger.info({ count: agents.size }, 'Loaded agents from disk');
  } catch (err) {
    logger.error(err, 'Failed to load agents from disk (starting fresh)');
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function saveAgent(agent: DeployedAgent): void {
  agents.set(agent.agent_id, agent);
  persistToDisk();
  logger.info({ agent_id: agent.agent_id, tier_id: agent.tier_id }, 'Agent saved');
}

export function getAgent(agent_id: string): DeployedAgent | null {
  return agents.get(agent_id) ?? null;
}

export function listAgents(owner_wallet?: string): DeployedAgent[] {
  const all = Array.from(agents.values());
  return owner_wallet ? all.filter(a => a.owner_wallet === owner_wallet) : all;
}

export function listPublicAgents(tag?: string, bundle?: string): DeployedAgent[] {
  let result = Array.from(agents.values()).filter(a => a.is_public === true);
  if (tag) {
    result = result.filter(a => a.tags?.includes(tag));
  }
  if (bundle) {
    result = result.filter(a => a.bundles.includes(bundle as DeployedAgent['bundles'][number]));
  }
  return result;
}

export function updateAgentStatus(agent_id: string, status: AgentStatus): boolean {
  const agent = agents.get(agent_id);
  if (!agent) return false;
  agent.status = status;
  agent.last_activity = new Date();
  persistToDisk();
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
  agent.logs.push({ timestamp: new Date(), level, message });
  agent.last_activity = new Date();
  return true;
}

export function recordPayment(agent_id: string, payment: PaymentRecord): boolean {
  const agent = agents.get(agent_id);
  if (!agent) return false;
  agent.subscription.payment_history.push(payment);
  // Advance next payment due by 30 days
  const next = new Date(agent.subscription.next_payment_due);
  next.setDate(next.getDate() + 30);
  agent.subscription.next_payment_due = next;
  agent.subscription.grace_period_end = null; // clear grace period on successful payment
  persistToDisk();
  logger.info({ agent_id, payment_id: payment.payment_id }, 'Payment recorded');
  return true;
}

export function setGracePeriod(agent_id: string): boolean {
  const agent = agents.get(agent_id);
  if (!agent) return false;
  const grace = new Date();
  grace.setDate(grace.getDate() + 7); // 7-day grace period
  agent.subscription.grace_period_end = grace;
  persistToDisk();
  logger.warn({ agent_id, grace_period_end: grace }, 'Grace period set for agent');
  return true;
}

export function deleteAgent(agent_id: string): boolean {
  const deleted = agents.delete(agent_id);
  if (deleted) {
    persistToDisk();
    logger.info({ agent_id }, 'Agent deleted');
  }
  return deleted;
}

export function clearAllAgents(): void {
  agents.clear();
  persistToDisk();
  logger.warn('All agents cleared');
}

export function getStats() {
  const all = Array.from(agents.values());
  return {
    total: all.length,
    by_status: {
      provisioning: all.filter(a => a.status === 'provisioning').length,
      running: all.filter(a => a.status === 'running').length,
      paused: all.filter(a => a.status === 'paused').length,
      failed: all.filter(a => a.status === 'failed').length,
      stopped: all.filter(a => a.status === 'stopped').length,
    },
    overdue: all.filter(
      a => a.subscription.next_payment_due < new Date() && a.status === 'running'
    ).length,
    in_grace: all.filter(
      a => a.subscription.grace_period_end !== null && a.status !== 'stopped'
    ).length,
  };
}
