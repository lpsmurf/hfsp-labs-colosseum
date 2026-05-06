import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

// ── Tool 1: Jupiter Price ───────────────────────────────────────────────────

const PriceInput = z.object({
  mint: z.string().describe('Solana token mint address'),
});

const PriceOutput = z.object({
  price_usd: z.number(),
  confidence: z.string().optional(),
  source: z.string(),
  cached: z.boolean(),
});

export const getJupiterPrice = createTool({
  id: 'get_jupiter_price',
  description:
    'Get token price in USD via Jupiter Price API v2. ' +
    'Call this when the user asks about a token price and you want Jupiter data.',
  inputSchema: PriceInput,
  outputSchema: PriceOutput,
  execute: async ({ context }) => {
    const { mint } = PriceInput.parse(context);

    return withCache(`jup_price_${mint}`, 20, async () => {
      const res = await axios.get(
        `https://api.jup.ag/price/v2?ids=${mint}&showExtraInfo=true`,
        { timeout: 8000 }
      );

      const data = res.data?.data?.[mint];
      if (!data?.price) throw new Error('No price from Jupiter');

      return {
        price_usd: parseFloat(data.price),
        confidence: data.extraInfo?.confidenceLevel ?? undefined,
        source: 'jupiter',
      };
    });
  },
});

// ── Tool 2: Jupiter Token by Ticker ─────────────────────────────────────────

const TickerInput = z.object({
  ticker: z.string().describe('Token ticker symbol, e.g. "BONK", "JUP", "WIF"'),
});

const TickerOutput = z.object({
  name: z.string(),
  symbol: z.string(),
  mint: z.string(),
  decimals: z.number(),
  cached: z.boolean(),
});

// Hardcoded fallback for well-known tokens when Jupiter token list API is unavailable
const KNOWN_TOKENS: Record<string, { name: string; symbol: string; mint: string; decimals: number }> = {
  SOL:  { name: 'Solana',     symbol: 'SOL',  mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { name: 'USD Coin',   symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  USDT: { name: 'Tether',     symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  BONK: { name: 'Bonk',       symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  JUP:  { name: 'Jupiter',    symbol: 'JUP',  mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
  WIF:  { name: 'dogwifhat',  symbol: 'WIF',  mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6 },
  RNDR: { name: 'Render',     symbol: 'RNDR', mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', decimals: 8 },
  PYTH: { name: 'Pyth Network', symbol: 'PYTH', mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', decimals: 6 },
};

export const getJupiterTokenByTicker = createTool({
  id: 'get_jupiter_token_by_ticker',
  description:
    'Find a Solana token by its ticker symbol. ' +
    'Call this when the user mentions a token by symbol (like "BONK" or "JUP") and you need the mint address.',
  inputSchema: TickerInput,
  outputSchema: TickerOutput,
  execute: async ({ context }) => {
    const { ticker } = TickerInput.parse(context);
    const upper = ticker.toUpperCase();

    return withCache(`jup_ticker_${upper}`, 300, async () => {
      // Try Jupiter token list API first
      try {
        const res = await axios.get(
          'https://token.jup.ag/strict',
          { timeout: 10000 }
        );
        const tokens: any[] = res.data ?? [];
        const match = tokens.find(
          (t: any) => (t.symbol as string).toUpperCase() === upper
        );
        if (match) {
          return {
            name: match.name ?? 'Unknown',
            symbol: match.symbol ?? ticker,
            mint: match.address ?? '',
            decimals: match.decimals ?? 6,
          };
        }
      } catch { /* fallback to known list */ }

      // Fallback to hardcoded known tokens
      const known = KNOWN_TOKENS[upper];
      if (known) return known;

      throw new Error(`Token "${ticker}" not found`);
    });
  },
});

// ── Tool 3: Jupiter Swap Quote ──────────────────────────────────────────────

const QuoteInput = z.object({
  from_mint: z.string().describe('Input token mint address'),
  to_mint: z.string().describe('Output token mint address'),
  amount_ui: z.number().positive().describe('Human-readable amount (not lamports)'),
});

const QuoteOutput = z.object({
  in_amount: z.string(),
  out_amount: z.string(),
  price_impact_pct: z.string(),
  route_plan: z.string(),
  cached: z.boolean(),
});

function getDecimals(mint: string): number {
  if (mint === 'So11111111111111111111111111111111111111112') return 9; // SOL
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return 6; // USDC
  if (mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') return 6; // USDT
  return 6;
}

export const getJupiterQuote = createTool({
  id: 'get_jupiter_quote',
  description:
    'Get a swap quote between two Solana tokens via Jupiter (read-only, no execution). ' +
    'Call this when the user asks "how much X would I get for Y" or wants a swap preview.',
  inputSchema: QuoteInput,
  outputSchema: QuoteOutput,
  execute: async ({ context }) => {
    const { from_mint, to_mint, amount_ui } = QuoteInput.parse(context);

    return withCache(`jup_quote_${from_mint}_${to_mint}_${amount_ui}`, 15, async () => {
      const inDecimals = getDecimals(from_mint);
      const outDecimals = getDecimals(to_mint);
      const amountLamports = Math.round(amount_ui * 10 ** inDecimals);

      const res = await axios.get(
        'https://quote-api.jup.ag/v6/quote',
        {
          params: {
            inputMint: from_mint,
            outputMint: to_mint,
            amount: amountLamports,
            slippageBps: 50,
          },
          timeout: 10000,
        }
      );

      const data = res.data;
      if (!data?.outAmount) throw new Error('No quote from Jupiter');

      const outHuman = (parseInt(data.outAmount, 10) / 10 ** outDecimals).toString();

      return {
        in_amount: amount_ui.toString(),
        out_amount: outHuman,
        price_impact_pct: data.priceImpactPct ?? '0',
        route_plan: (data.routePlan ?? []).map((r: any) => r.swapInfo?.label ?? '?').join(' → '),
      };
    });
  },
});
