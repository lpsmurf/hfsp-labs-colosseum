import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.TRIAL_DB_PATH ?? process.env.SQLITE_PATH ?? path.join(__dirname, '../data/quota.sqlite');

const DAILY_CAP = parseFloat(process.env.TRIAL_DAILY_BUDGET_USD ?? '50');

// Haiku 4.5 pricing (per token)
const INPUT_COST_PER_TOKEN = 0.00000025;
const OUTPUT_COST_PER_TOKEN = 0.00000125;

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS spend (
        day TEXT PRIMARY KEY,
        total_usd REAL NOT NULL DEFAULT 0
      )
    `);
  }
  return _db;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
}

export function recordSpend(usd: number): void {
  const d = today();
  db()
    .prepare('INSERT INTO spend (day, total_usd) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET total_usd = total_usd + ?')
    .run(d, usd, usd);
}

export function isBudgetExhausted(): boolean {
  const d = today();
  const row = db().prepare('SELECT total_usd FROM spend WHERE day = ?').get(d) as
    | { total_usd: number }
    | undefined;
  return row ? row.total_usd >= DAILY_CAP : false;
}

export function getBudgetRemaining(): number {
  const d = today();
  const row = db().prepare('SELECT total_usd FROM spend WHERE day = ?').get(d) as
    | { total_usd: number }
    | undefined;
  return Math.max(0, DAILY_CAP - (row?.total_usd ?? 0));
}
