/**
 * Token Tracker — Count tokens, enforce budgets, send alerts
 *
 * - Monthly reset on 1st of each month
 * - Shared pool: all user's agents share one budget
 * - Warnings at 80%, 100%, 125% of budget
 * - Budgets: Starter = 1M tokens, Pro = 5M tokens
 */

import { db } from '../db/index.js';

const TIER_BUDGETS: Record<string, number> = {
  starter: 1_000_000,
  pro: 5_000_000,
};

export interface UsageStatus {
  month: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  budget: number;
  percentUsed: number;
  alert?: 'warning' | 'exceeded' | 'critical';
}

export interface TokenRecord {
  userId: string;
  agentId: string;
  month: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Record token usage for a user/agent
 */
export function recordTokens(userId: string, agentId: string, model: string, input: number, output: number): void {
  const month = new Date().toISOString().slice(0, 7);

  db().prepare(`
    INSERT INTO token_usage (id, user_id, agent_id, month, input_tokens, output_tokens, model)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, month) DO UPDATE SET
      input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens,
      updated_at = datetime('now')
  `).run(userId, agentId, month, input, output, model);
}

/**
 * Get total token usage for a user this month
 */
export function getMonthlyUsage(userId: string): UsageStatus {
  const month = new Date().toISOString().slice(0, 7);

  const row = db()
    .prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as input,
        COALESCE(SUM(output_tokens), 0) as output,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total
      FROM token_usage
      WHERE user_id = ? AND month = ?
    `)
    .get(userId, month) as { input: number; output: number; total: number };

  const tier = getUserTier(userId);
  const budget = TIER_BUDGETS[tier] ?? TIER_BUDGETS.starter;
  const percentUsed = budget > 0 ? (row.total / budget) * 100 : 0;

  let alert: UsageStatus['alert'];
  if (percentUsed >= 125) alert = 'critical';
  else if (percentUsed >= 100) alert = 'exceeded';
  else if (percentUsed >= 80) alert = 'warning';

  return {
    month,
    inputTokens: row.input,
    outputTokens: row.output,
    totalTokens: row.total,
    budget,
    percentUsed,
    alert,
  };
}

/**
 * Check if user has exceeded their token budget
 */
export function isBudgetExceeded(userId: string): boolean {
  const usage = getMonthlyUsage(userId);
  return usage.percentUsed >= 100;
}

/**
 * Get user's tier from DB
 */
function getUserTier(userId: string): string {
  const row = db()
    .prepare('SELECT tier FROM users WHERE id = ?')
    .get(userId) as { tier?: string } | undefined;
  return row?.tier ?? 'starter';
}

/**
 * Get token budget for a tier
 */
export function getTierBudget(tier: string): number {
  return TIER_BUDGETS[tier] ?? TIER_BUDGETS.starter;
}

/**
 * Get all users who need alerts this month
 * (for background job / notification system)
 */
export function getUsersNeedingAlerts(): Array<{ userId: string; alert: string; percentUsed: number }> {
  const month = new Date().toISOString().slice(0, 7);

  const rows = db()
    .prepare(`
      SELECT
        u.id as user_id,
        u.tier,
        COALESCE(SUM(t.input_tokens + t.output_tokens), 0) as total
      FROM users u
      LEFT JOIN token_usage t ON t.user_id = u.id AND t.month = ?
      WHERE u.tier != 'free'
      GROUP BY u.id
    `)
    .all(month) as Array<{ user_id: string; tier: string; total: number }>;

  return rows
    .map((row) => {
      const budget = TIER_BUDGETS[row.tier] ?? TIER_BUDGETS.starter;
      const percentUsed = budget > 0 ? (row.total / budget) * 100 : 0;
      let alert: string | null = null;
      if (percentUsed >= 125) alert = 'critical';
      else if (percentUsed >= 100) alert = 'exceeded';
      else if (percentUsed >= 80) alert = 'warning';
      return { userId: row.user_id, alert, percentUsed };
    })
    .filter((r) => r.alert !== null) as Array<{ userId: string; alert: string; percentUsed: number }>;
}
