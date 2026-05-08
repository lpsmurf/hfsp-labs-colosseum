import { db } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const TIER_BUDGETS: Record<string, number> = {
  starter: 1_000_000,
  pro: 5_000_000,
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getUserTier(userId: string): string {
  const user = db()
    .prepare('SELECT tier FROM users WHERE id = ?')
    .get(userId) as { tier: string } | undefined;
  return user?.tier ?? 'starter';
}

export function getBudget(userId: string): number {
  return TIER_BUDGETS[getUserTier(userId)] ?? TIER_BUDGETS.starter;
}

export function getUsage(userId: string, month?: string): { input_tokens: number; output_tokens: number; total: number } {
  const m = month ?? currentMonth();
  const row = db()
    .prepare(`
      SELECT SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens
      FROM token_usage WHERE user_id = ? AND month = ?
    `)
    .get(userId, m) as { input_tokens: number | null; output_tokens: number | null } | undefined;

  const input = row?.input_tokens ?? 0;
  const output = row?.output_tokens ?? 0;
  return { input_tokens: input, output_tokens: output, total: input + output };
}

export function track(
  userId: string,
  agentId: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): void {
  const month = currentMonth();
  db().prepare(`
    INSERT INTO token_usage (id, user_id, agent_id, month, input_tokens, output_tokens, model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, month) DO UPDATE SET
      input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens,
      updated_at = datetime('now')
  `).run(uuidv4(), userId, agentId, month, inputTokens, outputTokens, model);

  const usage = getUsage(userId);
  const budget = getBudget(userId);

  if (usage.total >= budget * 1.25) {
    console.warn(`[token-tracker] CRITICAL: user ${userId} at ${Math.round(usage.total / budget * 100)}% of budget`);
  } else if (usage.total >= budget) {
    console.warn(`[token-tracker] EXCEEDED: user ${userId} over budget`);
  } else if (usage.total >= budget * 0.8) {
    console.warn(`[token-tracker] WARNING: user ${userId} at 80%+ of budget`);
  }
}

export function getRemainingBudget(userId: string): number {
  const budget = getBudget(userId);
  const usage = getUsage(userId);
  return Math.max(0, budget - usage.total);
}
