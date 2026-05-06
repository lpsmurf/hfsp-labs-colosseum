import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

const OutputSchema = z.object({
  tps: z.number(),
  num_transactions: z.number(),
  sample_period_secs: z.number(),
  cached: z.boolean(),
});

export const getNetworkTPS = createTool({
  id: 'get_network_tps',
  description:
    'Get the current Solana network TPS (transactions per second). ' +
    'Call this when the user asks about Solana speed, network performance, or TPS.',
  inputSchema: z.object({}),
  outputSchema: OutputSchema,
  execute: async () => {
    return withCache('network_tps', 10, async () => {
      const res = await axios.post(
        'https://api.mainnet-beta.solana.com',
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getRecentPerformanceSamples',
          params: [1],
        },
        { timeout: 8000 }
      );

      const sample = res.data?.result?.[0];
      if (!sample) throw new Error('No performance data from Solana RPC');

      const tps = Math.round(sample.numTransactions / sample.samplePeriodSecs);

      return {
        tps,
        num_transactions: sample.numTransactions,
        sample_period_secs: sample.samplePeriodSecs,
      };
    });
  },
});
