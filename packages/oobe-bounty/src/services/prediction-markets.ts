import type { Database } from 'better-sqlite3';

export interface PredictionMarket {
  id: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  predictedOutcome: string;
  probability: number;
  hoursLeft: number;
  endDate: string;
  volume: number;
  url: string;
}

const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
const KALSHI_BASE = 'https://trading-api.kalshi.com/trade-api/v2';

// Fetch and screen Polymarket markets.
// Strategy: query by end-date window directly to avoid scanning 10K+ markets.
// Also fetches restricted markets (which don't appear in standard active=true listings).
export async function fetchPolymarketScreened(
  minProbability = 0.92,
  maxProbability = 0.98,
  maxHoursLeft = 240, // 10 days — catches restricted/near-certain markets earlier
  minVolume = 500,    // lowered for sports/esports + restricted markets
): Promise<PredictionMarket[]> {
  const now = Date.now();
  const windowEnd = new Date(now + maxHoursLeft * 3_600_000).toISOString();
  const windowStart = new Date(now).toISOString();

  const allMarkets: PolymarketRaw[] = [];

  // 1. Date-windowed query (includes restricted markets via endDateMin/Max)
  for (const offset of [0, 100, 200, 300, 400, 500]) {
    const res = await fetch(
      `${POLYMARKET_BASE}/markets?closed=false&limit=100&offset=${offset}&endDateMin=${windowStart}&endDateMax=${windowEnd}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!res?.ok) break;
    const page = (await res.json()) as PolymarketRaw[];
    if (!Array.isArray(page) || page.length === 0) break;
    allMarkets.push(...page);
    if (page.length < 100) break;
  }

  // 2. Restricted markets (US-related events not in standard listings) — paginate all
  for (const offset of [0, 100, 200, 300, 400]) {
    const res = await fetch(
      `${POLYMARKET_BASE}/markets?closed=false&restricted=true&limit=100&offset=${offset}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!res?.ok) break;
    const page = (await res.json()) as PolymarketRaw[];
    if (!Array.isArray(page) || page.length === 0) break;
    const inWindow = page.filter(m => {
      if (!m.endDate) return false;
      const h = (new Date(m.endDate).getTime() - now) / 3_600_000;
      return h > 0 && h <= maxHoursLeft;
    });
    allMarkets.push(...inWindow);
    if (page.length < 100) break;
  }

  // 3. Breaking/trending markets sorted by 1-day price change (catches live sports/news)
  for (const sort of ['oneDayPriceChange', 'volume24hr']) {
    const res = await fetch(
      `${POLYMARKET_BASE}/markets?closed=false&limit=200&order=${sort}&descending=true`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!res?.ok) continue;
    const page = (await res.json()) as PolymarketRaw[];
    if (!Array.isArray(page)) continue;
    const inWindow = page.filter(m => {
      if (!m.endDate) return false;
      const h = (new Date(m.endDate).getTime() - now) / 3_600_000;
      return h > 0 && h <= maxHoursLeft;
    });
    allMarkets.push(...inWindow);
  }

  // Also fetch standard active listings (non-restricted markets, different sort)
  for (const offset of [0, 100, 200]) {
    const res = await fetch(
      `${POLYMARKET_BASE}/markets?closed=false&active=true&limit=100&offset=${offset}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (!res?.ok) break;
    const page = (await res.json()) as PolymarketRaw[];
    if (!Array.isArray(page) || page.length === 0) break;
    // Only keep those that fall in our time window
    const inWindow = page.filter(m => {
      if (!m.endDate) return false;
      const h = (new Date(m.endDate).getTime() - now) / 3_600_000;
      return h > 0 && h <= maxHoursLeft;
    });
    allMarkets.push(...inWindow);
    if (page.length < 100) break;
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = allMarkets.filter(m => {
    if (!m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const markets = deduped;
  const results: PredictionMarket[] = [];

  for (const m of markets) {
    try {
      const pricesRaw = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      const prices = (pricesRaw as string[]).map(Number);
      const outcomes: string[] = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes ?? ['Yes', 'No']);

      if (!m.endDate || prices.length === 0) continue;

      const endMs = new Date(m.endDate).getTime();
      const hoursLeft = (endMs - now) / 3_600_000;
      // Strict client-side filter — API date params are unreliable
      if (hoursLeft <= 0 || hoursLeft > maxHoursLeft) continue;

      const maxIdx = prices.indexOf(Math.max(...prices));
      const probability = prices[maxIdx];
      if (probability < minProbability || probability > maxProbability) continue;

      const volume = typeof m.volumeNum === 'number' ? m.volumeNum : parseFloat(m.volume ?? '0');
      if (volume < minVolume) continue;

      results.push({
        id: `poly_${m.id}`,
        source: 'polymarket',
        question: m.question,
        predictedOutcome: outcomes[maxIdx] ?? 'Yes',
        probability,
        hoursLeft: Math.round(hoursLeft * 10) / 10,
        endDate: m.endDate,
        volume,
        url: `https://polymarket.com/market/${m.slug}`,
      });
    } catch { /* skip malformed market */ }
  }

  return results.sort((a, b) => a.hoursLeft - b.hoursLeft);
}

// Fetch Kalshi markets (requires API key)
export async function fetchKalshiScreened(
  apiKey: string,
  minProbability = 0.92,
  maxProbability = 0.98,
  maxHoursLeft = 72,
): Promise<PredictionMarket[]> {
  if (!apiKey) return [];

  try {
    const res = await fetch(`${KALSHI_BASE}/markets?status=open&limit=200`, {
      headers: { Authorization: `Token ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { markets: KalshiMarketRaw[] };
    const now = Date.now();
    const results: PredictionMarket[] = [];

    for (const m of data.markets ?? []) {
      try {
        const endMs = new Date(m.close_time).getTime();
        const hoursLeft = (endMs - now) / 3_600_000;
        if (hoursLeft <= 0 || hoursLeft > maxHoursLeft) continue;

        // Kalshi yes_bid is cents (0–99), convert to probability
        const yesProbability = (m.yes_bid ?? 0) / 100;
        const noProbability = 1 - yesProbability;
        const probability = Math.max(yesProbability, noProbability);
        const outcome = probability === yesProbability ? 'Yes' : 'No';
        if (probability < minProbability || probability > maxProbability) continue;

        results.push({
          id: `kalshi_${m.ticker}`,
          source: 'kalshi',
          question: m.title,
          predictedOutcome: outcome,
          probability,
          hoursLeft: Math.round(hoursLeft * 10) / 10,
          endDate: m.close_time,
          volume: m.volume ?? 0,
          url: `https://kalshi.com/markets/${m.ticker}`,
        });
      } catch { /* skip */ }
    }

    return results.sort((a, b) => a.hoursLeft - b.hoursLeft);
  } catch { return []; }
}

// Check if a market has already been posted (avoid duplicates)
export function hasBeenPosted(db: Database, marketId: string): boolean {
  const row = db.prepare(
    `SELECT id FROM trading_signals WHERE reason LIKE ? LIMIT 1`,
  ).get(`%${marketId}%`) as { id: string } | undefined;
  return !!row;
}

// --- Raw API types ---

interface PolymarketRaw {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  outcomes: string | string[];
  outcomePrices: string | string[];
  volume?: string;
  volumeNum?: number;
  active?: boolean;
  closed?: boolean;
}

interface KalshiMarketRaw {
  ticker: string;
  title: string;
  close_time: string;
  yes_bid?: number;
  no_bid?: number;
  volume?: number;
}
