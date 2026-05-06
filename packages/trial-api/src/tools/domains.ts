import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

const SNS_BASE = 'https://sns-sdk-proxy.bonfida.workers.dev';

// ── Tool 1: Resolve .sol Domain ─────────────────────────────────────────────

const ResolveInput = z.object({
  domain: z.string().describe('.sol domain, e.g. "armani.sol" or just "armani"'),
});

const ResolveOutput = z.object({
  domain: z.string(),
  wallet_address: z.string(),
  cached: z.boolean(),
});

export const resolveSolDomain = createTool({
  id: 'resolve_sol_domain',
  description:
    'Resolve a .sol domain name to a Solana wallet address. ' +
    'Call this when the user provides a .sol domain like "armani.sol".',
  inputSchema: ResolveInput,
  outputSchema: ResolveOutput,
  execute: async ({ context }) => {
    const { domain } = ResolveInput.parse(context);
    const clean = domain.replace(/\.sol$/i, '');

    return withCache(`sns_${clean}`, 3600, async () => {
      const res = await axios.get(
        `${SNS_BASE}/resolve/${clean}`,
        { timeout: 8000 }
      );

      const wallet = res.data?.result as string | undefined;
      if (!wallet) throw new Error(`Domain "${domain}" not found`);

      return {
        domain: clean + '.sol',
        wallet_address: wallet,
      };
    });
  },
});

// ── Tool 2: Get Wallet Domain ───────────────────────────────────────────────

const WalletDomainInput = z.object({
  wallet: z.string().describe('Solana wallet address'),
});

const WalletDomainOutput = z.object({
  wallet: z.string(),
  domain: z.string().nullable(),
  cached: z.boolean(),
});

export const getWalletDomain = createTool({
  id: 'get_wallet_domain',
  description:
    'Get the primary .sol domain for a Solana wallet address. ' +
    'Call this when the user provides a wallet and you want to show their .sol name.',
  inputSchema: WalletDomainInput,
  outputSchema: WalletDomainOutput,
  execute: async ({ context }) => {
    const { wallet } = WalletDomainInput.parse(context);

    return withCache(`domain_${wallet}`, 3600, async () => {
      const res = await axios.get(
        `${SNS_BASE}/favorite-domain/${wallet}`,
        { timeout: 8000 }
      );

      const result = res.data?.result as string | undefined;
      // The API sometimes returns error strings like "Invalid domain input" as the result
      const isValidDomain = result && !result.toLowerCase().includes('invalid');
      return {
        wallet,
        domain: isValidDomain ? `${result}.sol` : null,
      };
    });
  },
});

// ── Tool 3: Get All Domain TLDs ─────────────────────────────────────────────

const TLDsOutput = z.object({
  tlds: z.array(z.string()),
  cached: z.boolean(),
});

const KNOWN_TLDS = ['.sol', '.bonk', '.poor', '.abc', '.memo'];

export const getAllDomainTLDs = createTool({
  id: 'get_all_domain_tlds',
  description:
    'List all available domain TLDs on Solana (e.g. .sol, .bonk, etc.). ' +
    'Call this when the user asks about domain extensions or TLDs on Solana.',
  inputSchema: z.object({}),
  outputSchema: TLDsOutput,
  execute: async () => {
    return withCache('tlds', 86400, async () => {
      try {
        const res = await axios.get(
          `${SNS_BASE}/tlds`,
          { timeout: 8000 }
        );
        const tlds: string[] = res.data?.result ?? [];
        return { tlds };
      } catch {
        // SNS proxy TLD endpoint is sometimes unavailable; return known list
        return { tlds: KNOWN_TLDS };
      }
    });
  },
});
