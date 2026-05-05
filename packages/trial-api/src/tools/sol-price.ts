import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { COINGECKO_BASE } from './_helpers.js';

const OutputSchema = z.object({
  price_usd: z.number(),
  change_24h_pct: z.number().optional(),
  source: z.string(),
  cached: z.boolean(),
});

export const getSolPrice = createTool({
  id: 'get_sol_price',
  description:
    'Get the current price of SOL in USD with 24h change. ' +
    'Call this when the user asks about SOL price, SOL value, or "how much is SOL".',
  inputSchema: z.object({}),
  outputSchema: OutputSchema,
  execute: async () => {
    return withCache('sol_price', 30, async () => {
      const res = await axios.get(`${COINGECKO_BASE}/simple/price`, {
        params: { ids: 'solana', vs_currencies: 'usd', include_24hr_change: 'true' },
        timeout: 5000,
      });
      const data = res.data?.solana;
      if (!data?.usd) throw new Error('No SOL price from CoinGecko');
      return {
        price_usd: data.usd as number,
        change_24h_pct: data.usd_24h_change as number | undefined,
        source: 'coingecko',
      };
    });
  },
});

// --- example verification ---
// const result = await getSolPrice.execute({ context: {} });
// console.log(result); // { price_usd: 84.2, change_24h_pct: 0.81, source: 'coingecko', cached: false }
