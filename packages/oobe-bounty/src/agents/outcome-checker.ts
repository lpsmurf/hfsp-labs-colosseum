import type { Database } from 'better-sqlite3';
import { fetchMarketData } from '../services/coingecko.js';
import { updateSignalOutcome, logAuditEvent } from '../db/migrations.js';
import { OUTCOME_CHECK_INTERVAL_MS, OUTCOME_WINDOW_MS } from '../config.js';

interface PendingSignal {
  id: string;
  symbol: string;
  action: string;
  actual_price: number;
  created_at: string;
}

export function startOutcomeChecker(db: Database): { stop: () => void } {
  let running = true;

  const tick = async () => {
    if (!running) return;

    // Find signals that are old enough to evaluate (>= OUTCOME_WINDOW_MS ago) but not yet checked
    const cutoff = new Date(Date.now() - OUTCOME_WINDOW_MS).toISOString();
    const pending = db.prepare(`
      SELECT id, symbol, action, actual_price, created_at
      FROM trading_signals
      WHERE outcome_recorded = 0
        AND action IN ('BUY', 'SELL')
        AND symbol != 'MARKET'
        AND created_at <= ?
      LIMIT 20
    `).all(cutoff) as PendingSignal[];

    for (const signal of pending) {
      try {
        const market = await fetchMarketData(signal.symbol);
        const entryPrice = signal.actual_price;
        if (entryPrice === 0) {
          // Can't evaluate — mark as recorded to skip
          updateSignalOutcome(db, signal.id, false);
          continue;
        }

        const pctChange = ((market.price - entryPrice) / entryPrice) * 100;
        const THRESHOLD = 0.5; // ≥0.5% move counts as directional

        let correct: boolean;
        if (signal.action === 'BUY') {
          correct = pctChange >= THRESHOLD;
        } else { // SELL
          correct = pctChange <= -THRESHOLD;
        }

        updateSignalOutcome(db, signal.id, correct);
        logAuditEvent(db, null, 'outcome_recorded', {
          signalId: signal.id,
          symbol: signal.symbol,
          action: signal.action,
          entryPrice,
          currentPrice: market.price,
          pctChange: pctChange.toFixed(2),
          correct,
        });
      } catch {
        // Skip this signal if price fetch fails — will retry next cycle
      }
    }
  };

  const timer = setInterval(() => void tick(), OUTCOME_CHECK_INTERVAL_MS);
  // First check after 5 minutes (let agents generate some signals first)
  setTimeout(() => void tick(), 5 * 60 * 1000);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
