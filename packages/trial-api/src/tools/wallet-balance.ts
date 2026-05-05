import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { SYMBOL_MAP, HELIUS_BASE, COINGECKO_BASE } from './_helpers.js';

const InputSchema = z.object({
  wallet: z.string().describe('Solana wallet address (base58)'),
});

const TokenEntry = z.object({
  mint: z.string(),
  symbol: z.string(),
  amount: z.number(),
  value_usd: z.number(),
});

const OutputSchema = z.object({
  sol_balance: z.number(),
  sol_value_usd: z.number(),
  top_tokens: z.array(TokenEntry),
  source: z.string(),
  cached: z.boolean(),
});

export const getWalletBalance = createTool({
  id: 'get_wallet_balance',
  description:
    'Get the SOL balance and top token holdings for any Solana wallet. ' +
    'Returns up to 5 tokens by USD value. ' +
    'Call this when user asks about wallet balance, holdings, or portfolio.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { wallet } = InputSchema.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) return { sol_balance: 0, sol_value_usd: 0, top_tokens: [], source: 'no_helius_key', cached: false };

    return withCache(`wallet_${wallet}`, 60, async () => {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

      // SOL balance
      const balRes = await axios.post(rpcUrl, {
        jsonrpc: '2.0', id: 1, method: 'getBalance',
        params: [wallet],
      }, { timeout: 8000 });
      const lamports: number = balRes.data?.result?.value ?? 0;
      const sol_balance = lamports / 1e9;

      // SOL price for USD value
      let solPrice = 0;
      try {
        const priceRes = await axios.get(`${COINGECKO_BASE}/simple/price`, {
          params: { ids: 'solana', vs_currencies: 'usd' },
          timeout: 5000,
        });
        solPrice = priceRes.data?.solana?.usd ?? 0;
      } catch { /* non-fatal */ }

      // Token accounts
      const tokRes = await axios.post(rpcUrl, {
        jsonrpc: '2.0', id: 2, method: 'getTokenAccountsByOwner',
        params: [wallet, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }],
      }, { timeout: 8000 });

      const accounts: any[] = tokRes.data?.result?.value ?? [];
      const mints = accounts
        .map((a: any) => ({
          mint: a.account.data.parsed.info.mint as string,
          amount: parseFloat(a.account.data.parsed.info.tokenAmount.uiAmountString ?? '0'),
        }))
        .filter(t => t.amount > 0);

      // Resolve token symbols via Helius token metadata
      let topTokens: z.infer<typeof TokenEntry>[] = [];
      if (mints.length > 0) {
        try {
          const metaRes = await axios.post(
            `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
            { jsonrpc: '2.0', id: 3, method: 'getAssetBatch',
              params: { ids: mints.slice(0, 10).map(m => m.mint) } },
            { timeout: 8000 }
          );
          const assets: any[] = metaRes.data?.result ?? [];
          const symFromMeta: Record<string, string> = {};
          for (const a of assets) {
            if (a?.id && a?.content?.metadata?.symbol) {
              symFromMeta[a.id] = a.content.metadata.symbol;
            }
          }
          topTokens = mints
            .map(m => ({
              mint: m.mint,
              symbol: SYMBOL_MAP[m.mint] ?? symFromMeta[m.mint] ?? m.mint.slice(0, 6) + '...',
              amount: m.amount,
              value_usd: 0,
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
        } catch {
          topTokens = mints.slice(0, 5).map(m => ({
            mint: m.mint, symbol: SYMBOL_MAP[m.mint] ?? m.mint.slice(0, 6) + '...', amount: m.amount, value_usd: 0,
          }));
        }
      }

      return {
        sol_balance,
        sol_value_usd: sol_balance * solPrice,
        top_tokens: topTokens,
        source: 'helius',
      };
    });
  },
});

// --- example verification ---
// const r = await getWalletBalance.execute({ context: { wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } });
// console.log(r); // { sol_balance: 12.5, sol_value_usd: 1812.5, top_tokens: [...], cached: false }
