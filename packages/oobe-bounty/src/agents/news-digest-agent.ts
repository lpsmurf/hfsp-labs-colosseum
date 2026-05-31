import type { Database } from 'better-sqlite3';
import { createAceClient } from '../services/ace-client.js';
import { extractX402Hash, recordX402Payment } from '../services/x402-payments.js';
import { insertSignal, logAuditEvent, setAgentRunning } from '../db/migrations.js';

const NY_HOUR = 9; // 9am New York time

export function startNewsDigestAgent(db: Database): { stop: () => void } {
  let running = true;
  setAgentRunning(db, 'news-digest-agent', true);

  const scheduleNextRun = () => {
    if (!running) return;
    const msUntilNext = msUntilNextNY9am();
    console.info(`[NewsDigest] Next run in ${(msUntilNext / 3_600_000).toFixed(1)}h (9am NY)`);
    setTimeout(async () => {
      if (!running) return;
      await runDigest(db).catch(err => {
        logAuditEvent(db, 'news-digest-agent', 'digest_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      scheduleNextRun(); // schedule the next day
    }, msUntilNext);
  };

  scheduleNextRun();
  return {
    stop: () => {
      running = false;
      setAgentRunning(db, 'news-digest-agent', false);
    },
  };
}

async function runDigest(db: Database): Promise<void> {
  const ace = createAceClient();
  logAuditEvent(db, 'news-digest-agent', 'digest_started', { time: new Date().toISOString() });

  // Fetch top 10 news across 3 topics in parallel (each is an x402 call)
  const [solanaNews, predMarketsNews, cryptoNews] = await Promise.all([
    fetchTopNews(ace, db, 'Solana SOL cryptocurrency news latest'),
    fetchTopNews(ace, db, 'prediction markets Polymarket Kalshi crypto bets'),
    fetchTopNews(ace, db, 'cryptocurrency Bitcoin Ethereum market news today'),
  ]);

  // Combine and deduplicate, take top 10
  const allItems = [...solanaNews, ...predMarketsNews, ...cryptoNews];
  const seen = new Set<string>();
  const top10 = allItems.filter(item => {
    const key = item.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);

  if (top10.length === 0) {
    logAuditEvent(db, 'news-digest-agent', 'digest_empty', {});
    return;
  }

  // Format the digest as a signal (symbol = 'NEWS' so formatters can handle it)
  const digestData = JSON.stringify({
    type: 'news_digest',
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' }),
    items: top10,
  });

  insertSignal(db, {
    agentId: 'news-digest-agent',
    service: 'search',
    action: 'HOLD',
    symbol: 'NEWS',
    target_price: 0,
    confidence: 1,
    reason: digestData,
    risk_level: 'LOW',
    actual_price: 0,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent(db, 'news-digest-agent', 'digest_completed', { itemCount: top10.length });
}

async function fetchTopNews(
  ace: ReturnType<typeof createAceClient>,
  db: Database,
  query: string,
): Promise<Array<{ title: string; source: string; url: string; snippet: string }>> {
  const result = (await ace.search.google({ query, type: 'news', language: 'en' })) as Record<string, unknown>;
  const x402Hash = extractX402Hash(result);
  recordX402Payment('news-digest-agent', 'search', x402Hash, db);

  const items = (result.news ?? result.organic_results ?? result.news_results ?? result.items ?? []) as Array<Record<string, unknown>>;
  return items.slice(0, 4).map(item => ({
    title: String(item.title ?? ''),
    source: String(item.source ?? ''),
    url: String(item.link ?? item.url ?? ''),
    snippet: String(item.snippet ?? ''),
  })).filter(item => item.title.length > 5);
}

function msUntilNextNY9am(): number {
  const now = new Date();
  // Use Intl to get the current hour/minute in New York without locale string parsing
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(now);

  const nyHour   = parseInt(nyParts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const nyMinute = parseInt(nyParts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const nySecond = parseInt(nyParts.find(p => p.type === 'second')?.value ?? '0', 10);

  // Seconds elapsed today in New York
  const elapsedSec = nyHour * 3600 + nyMinute * 60 + nySecond;
  const targetSec  = NY_HOUR * 3600;
  const diffSec    = elapsedSec < targetSec
    ? targetSec - elapsedSec
    : (86400 - elapsedSec) + targetSec;

  return Math.max(diffSec * 1000, 60_000);
}
