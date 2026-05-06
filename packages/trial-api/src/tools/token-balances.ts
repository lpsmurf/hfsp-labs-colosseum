import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { SYMBOL_MAP } from './_helpers.js';

const InputSchema = z.object({
  wallet: z.string().describe('Solana wallet address (base58)'),
});

const TokenItem = z.object({
  mint: z.string(),
  symbol: z.string().nullable(),
  amount: z.number(),
  decimals: z.number(),
});

const OutputSchema = z.object({
  wallet: z.string(),
  sol_balance: z.number(),
  tokens: z.array(TokenItem),
  token_count: z.number(),
  cached: z.boolean(),
});

export const getAllTokenBalances = createTool({
  id: 'get_all_token_balances',
  description:
    'Get the full token portfolio for a Solana wallet — all SPL tokens with balances. ' +
    'Call this when the user asks for their full portfolio, all tokens, or "what do I hold".',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { wallet } = InputSchema.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) return { wallet, sol_balance: 0, tokens: [], token_count: 0, source: 'no_helius_key', cached: false };

    return withCache(`balances_${wallet}`, 60, async () => {
      const res = await axios.get(
        `https://api.helius.xyz/v0/addresses/${wallet}/balances`,
        { params: { 'api-key': apiKey }, timeout: 10000 }
      );

      const data = res.data;
      const solBalance = (data.nativeBalance ?? 0) / 1e9;

      const tokens = (data.tokens ?? [])
        .filter((t: any) => (t.amount ?? 0) > 0)
        .map((t: any) => ({
          mint: t.mint as string,
          symbol: SYMBOL_MAP[t.mint as string] ?? null,
          amount: (t.amount ?? 0) / 10 ** (t.decimals ?? 6),
          decimals: t.decimals ?? 6,
        }));

      return {
        wallet,
        sol_balance: solBalance,
        tokens,
        token_count: tokens.length,
      };
    });
  },
});
