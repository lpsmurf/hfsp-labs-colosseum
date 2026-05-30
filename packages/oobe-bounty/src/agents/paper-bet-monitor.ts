import type { Database } from 'better-sqlite3';
import { getOpenBets, resolvePaperBet, getPnL } from '../services/paper-trading.js';
import { insertSignal, logAuditEvent } from '../db/migrations.js';
import type { PaperBet } from '../services/paper-trading.js';

const INTERVAL_MS = 30 * 60 * 1000;
const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
const STOP_LOSS_THRESHOLD = parseFloat(process.env.PAPER_STOP_LOSS ?? '0.81');

export function startPaperBetMonitor(db: Database): { stop: () => void } {
  let running = true;

  const tick = async () => {
    if (!running) return;
    const openBets = getOpenBets(db);
    if (openBets.length === 0) return;

    const now = Date.now();

    for (const bet of openBets) {
      try {
        if (bet.source !== 'polymarket') continue;
        const matured = new Date(bet.end_date).getTime() < now;
        if (matured) {
          await checkPolymarketResolution(db, bet);
        } else {
          await checkPolymarketStopLoss(db, bet);
        }
      } catch (err) {
        logAuditEvent(db, null, 'paper_bet_check_failed', {
          marketId: bet.market_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const timer = setInterval(() => void tick(), INTERVAL_MS);
  void tick();

  return { stop: () => { running = false; clearInterval(timer); } };
}

async function checkPolymarketResolution(db: Database, bet: PaperBet): Promise<void> {
  // Extract the raw Polymarket id from our prefixed id (poly_<id>)
  const rawId = bet.market_id.replace(/^poly_/, '');

  const res = await fetch(`${POLYMARKET_BASE}/markets/${rawId}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return;

  const market = (await res.json()) as PolyRaw;

  // Not resolved yet
  if (!market.closed && !market.resolvedBy) return;

  const pricesRaw = typeof market.outcomePrices === 'string'
    ? JSON.parse(market.outcomePrices) as string[]
    : (market.outcomePrices ?? []);
  const prices = pricesRaw.map(Number);
  const outcomes: string[] = typeof market.outcomes === 'string'
    ? JSON.parse(market.outcomes)
    : (market.outcomes ?? ['Yes', 'No']);

  // Resolved: winning outcome has price = 1
  const winnerIdx = prices.findIndex(p => p >= 0.99);
  if (winnerIdx === -1) return; // not resolved yet

  const actualOutcome = outcomes[winnerIdx] ?? 'Yes';
  const won = actualOutcome === bet.predicted_outcome;
  const resolved = resolvePaperBet(db, bet.market_id, actualOutcome, won);
  if (!resolved) return;

  // Post result as a signal so the distribution bots pick it up
  const pnl = getPnL(db, 3);
  const profitStr = pnl.netProfit >= 0 ? `+$${pnl.netProfit.toFixed(2)}` : `-$${Math.abs(pnl.netProfit).toFixed(2)}`;

  insertSignal(db, {
    agentId: 'prediction-markets-agent',
    service: 'search',
    action: won ? 'BUY' : 'SELL',
    symbol: 'PRED_RESULT',
    target_price: won ? resolved.actual_payout : 0,
    confidence: bet.entry_probability,
    reason: JSON.stringify({
      type: 'paper_bet_result',
      won,
      question: bet.question,
      predictedOutcome: bet.predicted_outcome,
      actualOutcome,
      stake: bet.stake,
      payout: resolved.actual_payout,
      profit: won ? resolved.actual_payout - bet.stake : -bet.stake,
      probability: bet.entry_probability,
      marketUrl: bet.market_url,
      // Running 3-day stats
      stats: {
        totalBets: pnl.totalBets,
        won: pnl.won,
        lost: pnl.lost,
        winRate: pnl.winRate,
        netProfit: pnl.netProfit,
        profitStr,
      },
    }),
    risk_level: 'LOW',
    actual_price: 0,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent(db, 'prediction-markets-agent', 'paper_bet_resolved', {
    marketId: bet.market_id,
    won,
    actualOutcome,
    profit: won ? resolved.actual_payout - bet.stake : -bet.stake,
    runningNetProfit: pnl.netProfit,
  });
}

async function checkPolymarketStopLoss(db: Database, bet: PaperBet): Promise<void> {
  const rawId = bet.market_id.replace(/^poly_/, '');
  const res = await fetch(`${POLYMARKET_BASE}/markets/${rawId}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return;

  const market = (await res.json()) as PolyRaw;
  const pricesRaw = typeof market.outcomePrices === 'string'
    ? JSON.parse(market.outcomePrices) as string[]
    : (market.outcomePrices ?? []);
  const prices = pricesRaw.map(Number);
  const outcomes: string[] = typeof market.outcomes === 'string'
    ? JSON.parse(market.outcomes) : (market.outcomes ?? ['Yes', 'No']);

  // Find current probability of our predicted outcome
  const ourIdx = outcomes.findIndex(o => o === bet.predicted_outcome);
  if (ourIdx === -1) return;
  const currentProb = prices[ourIdx] ?? 0;

  if (currentProb < STOP_LOSS_THRESHOLD) {
    // Mark as void (stop-loss triggered)
    db.prepare(`
      UPDATE paper_bets SET status = 'void', actual_outcome = ?, resolved_at = datetime('now')
      WHERE market_id = ? AND status = 'open'
    `).run(`STOP_LOSS at ${(currentProb * 100).toFixed(0)}%`, bet.market_id);

    const pnl = getPnL(db, 3);
    const runningStr = pnl.netProfit >= 0 ? `+$${pnl.netProfit.toFixed(2)}` : `-$${Math.abs(pnl.netProfit).toFixed(2)}`;

    insertSignal(db, {
      agentId: 'prediction-markets-agent',
      service: 'search',
      action: 'SELL',
      symbol: 'PRED_STOPLOSS',
      target_price: currentProb,
      confidence: currentProb,
      reason: JSON.stringify({
        type: 'stop_loss',
        question: bet.question,
        predictedOutcome: bet.predicted_outcome,
        entryProbability: bet.entry_probability,
        currentProbability: currentProb,
        drop: Math.round((bet.entry_probability - currentProb) * 100),
        stake: bet.stake,
        marketUrl: bet.market_url,
        runningPnL: runningStr,
      }),
      risk_level: 'HIGH',
      actual_price: currentProb,
      timestamp: new Date().toISOString(),
    });

    logAuditEvent(db, 'prediction-markets-agent', 'paper_bet_stop_loss', {
      marketId: bet.market_id, entryProb: bet.entry_probability, currentProb,
    });
  }
}

interface PolyRaw {
  id: string;
  closed: boolean;
  resolvedBy?: string;
  outcomePrices: string | string[];
  outcomes: string | string[];
}
