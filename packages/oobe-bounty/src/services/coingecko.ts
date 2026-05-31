import type { TrendingToken } from '../types.js';

export interface MarketContext {
  fearGreedIndex: number;       // 0-100 (0=extreme fear, 100=extreme greed)
  fearGreedLabel: string;       // e.g. "Fear", "Greed"
  rsi14: number;                // 14-period RSI
  momentum7d: number;           // 7-day price change %
}

export async function fetchMarketContext(symbol: string): Promise<MarketContext> {
  const id = getCoingeckoId(symbol);

  // Fetch Fear & Greed + price history in parallel (both free)
  const [fngRes, historyRes] = await Promise.allSettled([
    fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=14&interval=daily`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
    ),
  ]);

  // Fear & Greed
  let fearGreedIndex = 50;
  let fearGreedLabel = 'Neutral';
  if (fngRes.status === 'fulfilled' && fngRes.value.ok) {
    const fng = (await fngRes.value.json()) as { data: Array<{ value: string; value_classification: string }> };
    fearGreedIndex = parseInt(fng.data[0]?.value ?? '50', 10);
    fearGreedLabel = fng.data[0]?.value_classification ?? 'Neutral';
  }

  // RSI-14 + 7d momentum from price history
  let rsi14 = 50;
  let momentum7d = 0;
  if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
    const history = (await historyRes.value.json()) as { prices: Array<[number, number]> };
    const prices = history.prices.map(([, p]) => p);
    if (prices.length >= 2) {
      momentum7d = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
    }
    if (prices.length >= 15) {
      rsi14 = computeRSI(prices.slice(-15));
    }
  }

  return { fearGreedIndex, fearGreedLabel, rsi14, momentum7d };
}

function computeRSI(prices: number[]): number {
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? Math.abs(c) : 0));
  const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

export interface SolanaMarketData {
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  fetchedAt: string;
}

const COINGECKO_IDS: Record<string, string> = {
  SOL: 'solana',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
};

export function getCoingeckoId(symbol: string): string {
  return COINGECKO_IDS[symbol.toUpperCase()] ?? symbol.toLowerCase();
}

export async function fetchSolanaMarketData(): Promise<SolanaMarketData> {
  return fetchMarketData('SOL');
}

export async function fetchMarketData(symbol: string, retries = 3): Promise<SolanaMarketData> {
  const id = getCoingeckoId(symbol);
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3_000)); // 3s, 6s backoff
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) continue;
    if (!res.ok) throw new Error(`CoinGecko ${res.status} for ${symbol}`);

    const data = (await res.json()) as Record<string, {
      usd: number; usd_24h_change: number; usd_market_cap: number; usd_24h_vol: number;
    }>;
    const coin = data[id];
    if (!coin) throw new Error(`CoinGecko: no data for ${symbol} (id: ${id})`);
    return {
      price: coin.usd,
      change24h: coin.usd_24h_change,
      marketCap: coin.usd_market_cap,
      volume24h: coin.usd_24h_vol,
      fetchedAt: new Date().toISOString(),
    };
  }
  throw new Error(`CoinGecko rate limited after ${retries} retries for ${symbol}`);
}

export async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CoinGecko trending ${res.status}`);

  const data = (await res.json()) as {
    coins: Array<{
      item: {
        id: string;
        name: string;
        symbol: string;
        market_cap_rank: number;
        data?: { price_change_percentage_24h?: { usd?: number }; price?: string };
      };
    }>;
  };

  const tokens = data.coins.slice(0, 10);

  // Fetch prices for all trending tokens in one call
  const ids = tokens.map(c => c.item.id).join(',');
  let prices: Record<string, { usd?: number; usd_24h_change?: number }> = {};
  try {
    const priceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
    );
    if (priceRes.ok) prices = (await priceRes.json()) as typeof prices;
  } catch { /* use data.price fallback */ }

  return tokens.map((c, i) => {
    const priceData = prices[c.item.id];
    const price = priceData?.usd ?? parseFloat(c.item.data?.price ?? '0') ?? 0;
    const change24h = priceData?.usd_24h_change ?? c.item.data?.price_change_percentage_24h?.usd ?? 0;
    return {
      rank: i + 1,
      name: c.item.name,
      symbol: c.item.symbol.toUpperCase(),
      coingeckoId: c.item.id,
      price,
      change24h,
    };
  });
}
