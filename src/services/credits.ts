/**
 * Clawdrop Per-Call Credits System
 * Inspired by Frames.ag micropayment model.
 * 
 * Agents hold a USDC credit balance.
 * Premium tool calls deduct from balance before executing.
 * Top-up via SOL→USDC swap or direct USDC transfer.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

// Cost per tool call in USD (most tools are free)
export const TOOL_COSTS_USD: Record<string, number> = {
  web_search: 0.001,        // $0.001 — Brave API cost passthrough
  book_flight: 0.50,        // $0.50 per booking (premium action)
  stake_sol: 0.010,         // $0.01 per stake
  get_cex_balance: 0.001,   // $0.001 — CEX API call
  // Everything else: 0 (free with subscription)
};

export interface CreditTransaction {
  id: string;
  type: 'topup' | 'spend';
  tool?: string;
  amount_usd: number;
  tx_hash?: string;
  timestamp: string;
}

export interface CreditLedger {
  agent_id: string;
  balance_usd: number;
  total_topped_up_usd: number;
  total_spent_usd: number;
  transactions: CreditTransaction[];
}

const CREDITS_FILE = process.env.CREDITS_FILE || '/tmp/clawdrop-credits.json';
const creditStore = new Map<string, CreditLedger>();

// Load from disk on init
try {
  if (fs.existsSync(CREDITS_FILE)) {
    const data = JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf-8'));
    for (const [id, ledger] of Object.entries(data)) {
      creditStore.set(id, ledger as CreditLedger);
    }
    logger.info({ count: creditStore.size }, 'Credits loaded from disk');
  }
} catch { /* start fresh */ }

function saveToDisk(): void {
  try {
    const data: Record<string, CreditLedger> = {};
    for (const [id, ledger] of creditStore) data[id] = ledger;
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to save credits to disk');
  }
}

export function getCredits(agent_id: string): CreditLedger {
  if (!creditStore.has(agent_id)) {
    creditStore.set(agent_id, {
      agent_id,
      balance_usd: 0,
      total_topped_up_usd: 0,
      total_spent_usd: 0,
      transactions: [],
    });
  }
  return creditStore.get(agent_id)!;
}

export function topUpCredits(agent_id: string, amount_usd: number, tx_hash: string): CreditLedger {
  const ledger = getCredits(agent_id);
  ledger.balance_usd = Math.round((ledger.balance_usd + amount_usd) * 1e6) / 1e6;
  ledger.total_topped_up_usd = Math.round((ledger.total_topped_up_usd + amount_usd) * 1e6) / 1e6;
  ledger.transactions.push({
    id: `topup_${Date.now()}`,
    type: 'topup',
    amount_usd,
    tx_hash,
    timestamp: new Date().toISOString(),
  });
  saveToDisk();
  logger.info({ agent_id, amount_usd, balance: ledger.balance_usd }, 'Credits topped up');
  return ledger;
}

export function deductCredit(agent_id: string, tool: string): { ok: boolean; balance_usd: number; cost_usd: number; reason?: string } {
  const cost = TOOL_COSTS_USD[tool] ?? 0;
  if (cost === 0) return { ok: true, balance_usd: getCredits(agent_id).balance_usd, cost_usd: 0 };

  const ledger = getCredits(agent_id);
  if (ledger.balance_usd < cost) {
    return { ok: false, balance_usd: ledger.balance_usd, cost_usd: cost, reason: `Insufficient credits: need $${cost}, have $${ledger.balance_usd.toFixed(4)}` };
  }

  ledger.balance_usd = Math.round((ledger.balance_usd - cost) * 1e6) / 1e6;
  ledger.total_spent_usd = Math.round((ledger.total_spent_usd + cost) * 1e6) / 1e6;
  ledger.transactions.push({
    id: `spend_${Date.now()}`,
    type: 'spend',
    tool,
    amount_usd: cost,
    timestamp: new Date().toISOString(),
  });
  saveToDisk();
  return { ok: true, balance_usd: ledger.balance_usd, cost_usd: cost };
}

export function getCreditsSummary(): { total_agents: number; total_usd_held: number; total_usd_spent: number } {
  let total_usd_held = 0, total_usd_spent = 0;
  for (const ledger of creditStore.values()) {
    total_usd_held += ledger.balance_usd;
    total_usd_spent += ledger.total_spent_usd;
  }
  return { total_agents: creditStore.size, total_usd_held, total_usd_spent };
}
