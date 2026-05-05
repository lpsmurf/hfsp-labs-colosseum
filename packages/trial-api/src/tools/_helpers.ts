export const MINT_MAP: Record<string, string> = {
  SOL:  'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP:  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  HERD: '6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R',
};

export const SYMBOL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MINT_MAP).map(([sym, mint]) => [mint, sym])
);

// CoinGecko IDs for well-known tokens
export const COINGECKO_IDS: Record<string, string> = {
  SOL:  'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  BONK: 'bonk',
  JUP:  'jupiter-exchange-solana',
};

export function formatUsd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

export function truncate<T>(arr: T[], max: number): T[] {
  return arr.slice(0, max);
}

export const HELIUS_BASE = 'https://api.helius.xyz';
export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
