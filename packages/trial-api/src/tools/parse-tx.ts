import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { HELIUS_BASE } from './_helpers.js';

const InputSchema = z.object({
  signature: z.string().describe('Solana transaction signature'),
});

const OutputSchema = z.object({
  signature: z.string(),
  type: z.string(),
  description: z.string(),
  fee_sol: z.number(),
  timestamp: z.string(),
  source: z.string(),
  cached: z.boolean(),
});

export const parseTransaction = createTool({
  id: 'parse_transaction',
  description:
    'Parse a single Solana transaction by signature and return a human-readable breakdown. ' +
    'Call this when the user provides a tx signature and wants to know what happened.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { signature } = InputSchema.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) return { signature, type: 'UNKNOWN', description: 'No Helius key', fee_sol: 0, timestamp: '', source: 'no_helius_key', cached: false };

    return withCache(`parse_tx_${signature}`, 3600, async () => {
      const res = await axios.post(
        `${HELIUS_BASE}/v0/transactions/?api-key=${apiKey}`,
        { transactions: [signature] },
        { timeout: 10000 }
      );

      const tx = res.data?.[0];
      if (!tx) throw new Error('Transaction not found');

      return {
        signature: tx.signature as string,
        type: (tx.type as string) ?? 'UNKNOWN',
        description: (tx.description as string) ?? 'No description',
        fee_sol: (tx.fee ?? 0) / 1e9,
        timestamp: new Date((tx.timestamp as number) * 1000).toISOString(),
        source: 'helius',
      };
    });
  },
});
