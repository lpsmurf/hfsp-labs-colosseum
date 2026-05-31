import type { Database } from 'better-sqlite3';
import { insertSignal, logAuditEvent, setAgentRunning } from '../db/migrations.js';
import type { NewsItem } from './base.js';

// Fires at 9am and 5pm New York time — posts ONE combined message for SOL, BTC, ETH
const RUN_HOURS_NY = [9, 17];

export function startCryptoNewsDigest(db: Database): { stop: () => void } {
  let running = true;
  setAgentRunning(db, 'crypto-news-digest', true);

  const scheduleNext = () => {
    if (!running) return;
    const ms = msUntilNextRun();
    const hrs = (ms / 3_600_000).toFixed(1);
    console.info(`[CryptoNewsDigest] Next run in ${hrs}h`);
    setTimeout(async () => {
      if (!running) return;
      await runCryptoNewsDigest(db).catch(err => {
        logAuditEvent(db, 'crypto-news-digest', 'digest_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      scheduleNext();
    }, ms);
  };

  scheduleNext();
  return {
    stop: () => {
      running = false;
      setAgentRunning(db, 'crypto-news-digest', false);
    },
  };
}

async function runCryptoNewsDigest(db: Database): Promise<void> {
  const symbols = ['SOL', 'BTC', 'ETH'];

  // Pull the latest NewsBot headlines + URLs from DB for each symbol
  const coinNews: Record<string, NewsItem[]> = {};
  for (const symbol of symbols) {
    const row = db.prepare(`
      SELECT reason FROM trading_signals
      WHERE agent_id = 'price-monitor' AND symbol = ? AND reason LIKE '%news_items%'
      ORDER BY created_at DESC LIMIT 1
    `).get(symbol) as { reason: string } | undefined;

    if (row) {
      try {
        const data = JSON.parse(row.reason) as { type: string; items: NewsItem[] };
        if (data.type === 'news_items') coinNews[symbol] = data.items.slice(0, 4);
      } catch { /* ignore */ }
    }
    if (!coinNews[symbol]) coinNews[symbol] = [];
  }

  // Insert as ONE combined signal — symbol CRYPTO_NEWS, Telegram bot handles formatting
  insertSignal(db, {
    agentId: 'crypto-news-digest',
    service: 'search',
    action: 'HOLD',
    symbol: 'CRYPTO_NEWS',
    target_price: 0,
    confidence: 0.5,
    reason: JSON.stringify({
      type: 'crypto_news_digest',
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      coins: coinNews,
    }),
    risk_level: 'LOW',
    actual_price: 0,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent(db, 'crypto-news-digest', 'digest_posted', {
    symbols,
    counts: Object.fromEntries(Object.entries(coinNews).map(([k, v]) => [k, v.length])),
  });
}

function msUntilNextRun(): number {
  const now = new Date();
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(now);

  const nyHour   = parseInt(nyParts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const nyMinute = parseInt(nyParts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const nySecond = parseInt(nyParts.find(p => p.type === 'second')?.value ?? '0', 10);
  const elapsedSec = nyHour * 3600 + nyMinute * 60 + nySecond;

  // Find next scheduled hour
  const nextHour = RUN_HOURS_NY.find(h => h * 3600 > elapsedSec)
    ?? (RUN_HOURS_NY[0] + 24); // tomorrow's first run

  const diffSec = nextHour * 3600 - elapsedSec;
  return Math.max(diffSec * 1000, 60_000);
}
