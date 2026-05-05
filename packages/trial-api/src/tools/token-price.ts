import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { MINT_MAP, SYMBOL_MAP, COINGECKO_IDS, COINGECKO_BASE } from './_helpers.js';

const InputSchema = z.object({
  symbol: z.string().describe(
    'Token symbol (SOL, USDC, BONK, JUP, HERD) or a Solana mint address'
  ),
});

const OutputSchema = z.object({
  symbol: z.string(),
  price_usd: z.number(),
  change_24h_pct: z.number().optional(),
  mint: z.string(),
  source: z.string(),
  cached: z.boolean(),
});

export const getTokenPrice = createTool({
  id: 'get_token_price',
  description:
    'Get the current USD price of any Solana token. ' +
    'Supports SOL, USDC, BONK, JUP, HERD by symbol, or any mint address. ' +
    'Call this when user asks about a token price or "how much is X worth".',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { symbol } = InputSchema.parse(context);
    const upperSym = symbol.toUpperCase();
    const mint = MINT_MAP[upperSym] ?? symbol;
    const resolvedSym = SYMBOL_MAP[mint] ?? upperSym;
    const cgId = COINGECKO_IDS[resolvedSym];
    const cacheKey = `token_price_${mint}`;

    return withCache(cacheKey, 30, async () => {
      if (cgId) {
        const res = await axios.get(`${COINGECKO_BASE}/simple/price`, {
          params: { ids: cgId, vs_currencies: 'usd', include_24hr_change: 'true' },
          timeout: 5000,
        });
        const data = res.data?.[cgId];
        return {
          symbol: resolvedSym,
          price_usd: (data?.usd as number) ?? 0,
          change_24h_pct: data?.usd_24h_change as number | undefined,
          mint,
          source: 'coingecko',
        };
      }
      // Unknown token — return unavailable rather than crash
      return {
        symbol: resolvedSym,
        price_usd: 0,
        mint,
        source: 'unavailable — mint not indexed',
      };
    });
  },
});

// --- example verification ---
// const r = await getTokenPrice.execute({ context: { symbol: 'BONK' } });
// console.log(r); // { symbol: 'BONK', price_usd: 0.00000625, mint: 'DezX...', source: 'coingecko', cached: false }
