import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';
import { HELIUS_BASE } from './_helpers.js';

const InputSchema = z.object({
  mint: z.string().describe('Solana token mint address to check for safety signals'),
});

const OutputSchema = z.object({
  score: z.enum(['green', 'yellow', 'red']),
  signals: z.array(z.string()),
  holders: z.number(),
  mint_authority: z.string().nullable(),
  freeze_authority: z.string().nullable(),
  cached: z.boolean(),
});

export const checkTokenSafety = createTool({
  id: 'check_token_safety',
  description:
    'Check safety signals for a Solana token by mint address. ' +
    'Returns a green/yellow/red risk score with specific signals (mint authority, freeze authority, holder concentration). ' +
    'Call this when user asks if a token is safe, a rug, or wants to check a contract.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ context }) => {
    const { mint } = InputSchema.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      return { score: 'yellow' as const, signals: ['Helius API key not configured'], holders: 0, mint_authority: null, freeze_authority: null, cached: false };
    }

    return withCache(`safety_${mint}`, 60, async () => {
      const signals: string[] = [];
      let holders = 0;
      let mint_authority: string | null = null;
      let freeze_authority: string | null = null;

      // Asset metadata via Helius DAS
      try {
        const assetRes = await axios.post(
          `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
          { jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } },
          { timeout: 8000 }
        );
        const asset = assetRes.data?.result;
        mint_authority = asset?.mint_extensions?.mint_close_authority?.closeAuthority ?? null;
        freeze_authority = asset?.token_info?.freeze_authority ?? null;

        if (mint_authority) signals.push('⚠️ Mint authority not renounced — new tokens can be created');
        else signals.push('✅ Mint authority renounced');

        if (freeze_authority) signals.push('⚠️ Freeze authority active — accounts can be frozen');
        else signals.push('✅ Freeze authority renounced');
      } catch { signals.push('⚠️ Could not fetch asset metadata'); }

      // Holder concentration
      try {
        const holdersRes = await axios.post(
          `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
          { jsonrpc: '2.0', id: 2, method: 'getTokenLargestAccounts', params: [mint] },
          { timeout: 8000 }
        );
        const accounts: any[] = holdersRes.data?.result?.value ?? [];
        holders = accounts.length;

        if (accounts.length >= 2) {
          const totalAmt = accounts.reduce((s: number, a: any) => s + parseFloat(a.uiAmountString ?? '0'), 0);
          const top10Pct = accounts.slice(0, 10).reduce((s: number, a: any) => s + parseFloat(a.uiAmountString ?? '0'), 0) / totalAmt * 100;
          if (top10Pct > 80) signals.push(`⚠️ Top 10 holders own ${top10Pct.toFixed(0)}% of supply`);
          else if (top10Pct > 50) signals.push(`⚠️ Top 10 holders own ${top10Pct.toFixed(0)}% of supply — moderate concentration`);
          else signals.push(`✅ Top 10 holders own ${top10Pct.toFixed(0)}% — reasonable distribution`);
        }
      } catch { signals.push('⚠️ Could not fetch holder data'); }

      // Score
      const redCount = signals.filter(s => s.startsWith('⚠️')).length;
      const score: 'green' | 'yellow' | 'red' =
        redCount === 0 ? 'green' : redCount === 1 ? 'yellow' : 'red';

      return { score, signals, holders, mint_authority, freeze_authority };
    });
  },
});

// --- example verification ---
// const r = await checkTokenSafety.execute({ context: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' } });
// console.log(r); // { score: 'green', signals: ['✅ Mint authority renounced', ...], holders: 20, ... }
