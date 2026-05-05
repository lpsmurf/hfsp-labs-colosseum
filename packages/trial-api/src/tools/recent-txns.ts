import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { HELIUS_BASE } from './_helpers.js';

const InputSchema = z.object({
  wallet: z.string().describe('Solana wallet address (base58)'),
  limit: z.number().int().min(1).max(10).default(5).describe('Number of transactions to return (max 10)'),
});

const TxEntry = z.object({
  signature: z.string(),
  type: z.string(),
  description: z.string(),
  timestamp: z.string(),
  value_sol: z.number().optional(),
});

const OutputSchema = z.object({
  wallet: z.string(),
  transactions: z.array(TxEntry),
  source: z.string(),
  cached: z.boolean(),
});

export const getRecentTxns = createTool({
  id: 'get_recent_txns',
  description:
    'Get recent transactions for a Solana wallet with human-readable descriptions. ' +
    'Call this when user asks about recent activity, transaction history, or what happened in a wallet.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { wallet, limit } = InputSchema.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) return { wallet, transactions: [], source: 'no_helius_key', cached: false };

    const cacheKey = `txns_${wallet}_${limit}`;
    return withCache(cacheKey, 120, async () => {
      const res = await axios.get(
        `${HELIUS_BASE}/v0/addresses/${wallet}/transactions`,
        {
          params: { 'api-key': apiKey, limit },
          timeout: 10000,
        }
      );

      const raw: any[] = res.data ?? [];
      const transactions = raw.slice(0, limit).map((tx: any) => ({
        signature: (tx.signature as string).slice(0, 16) + '...',
        type: (tx.type as string) ?? 'UNKNOWN',
        description: (tx.description as string) || summariseTx(tx),
        timestamp: new Date((tx.timestamp as number) * 1000).toISOString(),
        value_sol: tx.nativeTransfers?.[0]?.amount
          ? tx.nativeTransfers[0].amount / 1e9
          : undefined,
      }));

      return { wallet, transactions, source: 'helius' };
    });
  },
});

function summariseTx(tx: any): string {
  if (tx.tokenTransfers?.length) return `Token transfer (${tx.tokenTransfers[0]?.symbol ?? 'unknown'})`;
  if (tx.nativeTransfers?.length) return `SOL transfer: ${(tx.nativeTransfers[0].amount / 1e9).toFixed(4)} SOL`;
  return tx.type ?? 'Transaction';
}

// --- example verification ---
// const r = await getRecentTxns.execute({ context: { wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', limit: 3 } });
// console.log(r.transactions); // [{ signature: '...', type: 'TRANSFER', description: 'Transferred 1.5 SOL', ... }]
