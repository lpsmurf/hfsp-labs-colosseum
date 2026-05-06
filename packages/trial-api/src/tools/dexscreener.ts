import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

const InputSchema = z.object({
  address: z.string().describe('Solana token mint address (base58)'),
});

const OutputSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  price_usd: z.number(),
  volume_24h: z.number(),
  liquidity_usd: z.number(),
  price_change_24h: z.number(),
  pair_address: z.string(),
  dex: z.string(),
  cached: z.boolean(),
});

export const getTokenByAddress = createTool({
  id: 'get_token_by_address',
  description:
    'Get token data (price, volume, liquidity) for a Solana token by its mint address via DexScreener. ' +
    'Call this when the user asks about a specific token contract or wants DEX data.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { address } = InputSchema.parse(context);

    return withCache(`dex_${address}`, 30, async () => {
      const res = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${address}`,
        { timeout: 8000 }
      );

      const pairs: any[] = res.data?.pairs ?? [];
      const pair = pairs.find((p: any) => p.chainId === 'solana');
      if (!pair) throw new Error('No Solana pair found for this token');

      return {
        name: pair.baseToken?.name ?? 'Unknown',
        symbol: pair.baseToken?.symbol ?? '???',
        price_usd: parseFloat(pair.priceUsd ?? '0'),
        volume_24h: parseFloat(pair.volume?.h24 ?? '0'),
        liquidity_usd: parseFloat(pair.liquidity?.usd ?? '0'),
        price_change_24h: parseFloat(pair.priceChange?.h24 ?? '0'),
        pair_address: pair.pairAddress ?? '',
        dex: pair.dexId ?? 'unknown',
      };
    });
  },
});
