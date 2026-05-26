export interface SolanaMarketData {
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  fetchedAt: string;
}

export async function fetchSolanaMarketData(): Promise<SolanaMarketData> {
  const url =
    'https://api.coingecko.com/api/v3/simple/price' +
    '?ids=solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

  const data = (await res.json()) as {
    solana: { usd: number; usd_24h_change: number; usd_market_cap: number; usd_24h_vol: number };
  };

  return {
    price: data.solana.usd,
    change24h: data.solana.usd_24h_change,
    marketCap: data.solana.usd_market_cap,
    volume24h: data.solana.usd_24h_vol,
    fetchedAt: new Date().toISOString(),
  };
}
