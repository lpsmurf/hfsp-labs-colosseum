import { db } from './db.js';
import { env } from './env.js';
import { getUtcDate } from './rate-limit.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS spend (
    day TEXT PRIMARY KEY,
    total_usd REAL NOT NULL DEFAULT 0
  );
`);

const getSpendStmt = db.prepare(
  'SELECT total_usd FROM spend WHERE day = ?'
);
const insertSpendStmt = db.prepare(
  'INSERT INTO spend (day, total_usd) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET total_usd = spend.total_usd + excluded.total_usd'
);

export function isBudgetExhausted(): boolean {
  const day = getUtcDate();
  const row = getSpendStmt.get(day) as { total_usd: number } | undefined;
  const total = row?.total_usd ?? 0;
  return total >= env.TRIAL_DAILY_BUDGET_USD;
}

export function recordSpend(usd: number): void {
  const day = getUtcDate();
  insertSpendStmt.run(day, usd);
}

export function getRemainingBudget(): number {
  const day = getUtcDate();
  const row = getSpendStmt.get(day) as { total_usd: number } | undefined;
  const total = row?.total_usd ?? 0;
  return Math.max(0, env.TRIAL_DAILY_BUDGET_USD - total);
}

/**
 * Estimate spend for a request using Haiku 4.5 pricing.
 * input: $0.25 / 1M tokens  → 0.00000025 per token
 * output: $1.25 / 1M tokens → 0.00000125 per token
 */
export function estimateSpend(inputTokens: number, outputTokens: number): number {
  return inputTokens * 0.00000025 + outputTokens * 0.00000125;
}
