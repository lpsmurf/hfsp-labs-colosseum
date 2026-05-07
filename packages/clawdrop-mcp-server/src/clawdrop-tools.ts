import axios from 'axios';
import { z } from 'zod';

const api = axios.create({
  baseURL: process.env.HFSP_API_URL ?? 'https://clawdrop.live/api',
  timeout: 15000,
});

export const clawdropTools = [
  {
    name: 'list_tiers',
    description: 'List available Openclaw agent deployment tiers (Starter, Pro) with pricing in SOL/USDC/USDT.',
    schema: z.object({}),
    handler: async (_agent: any, _args: any) => {
      const res = await api.get('/platform/payments/quote?tier=starter');
      return JSON.stringify(res.data);
    },
  },
  {
    name: 'get_token_analytics',
    description: 'Get price, volume, liquidity, and holder count for a Solana token by mint address.',
    schema: z.object({ mint: z.string().describe('Token mint address') }),
    handler: async (_agent: any, args: any) => {
      const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${args.mint}`);
      const pair = res.data?.pairs?.find((p: any) => p.chainId === 'solana');
      if (!pair) return 'No data found';
      return JSON.stringify({
        name: pair.baseToken?.name,
        symbol: pair.baseToken?.symbol,
        price_usd: pair.priceUsd,
        volume_24h: pair.volume?.h24,
        liquidity_usd: pair.liquidity?.usd,
      });
    },
  },
  {
    name: 'get_market_overview',
    description: 'Get trending Solana tokens by volume from DexScreener.',
    schema: z.object({}),
    handler: async (_agent: any, _args: any) => {
      const res = await axios.get('https://api.dexscreener.com/latest/dex/search?q=solana');
      const top = (res.data?.pairs ?? [])
        .filter((p: any) => p.chainId === 'solana')
        .slice(0, 10);
      return JSON.stringify(
        top.map((p: any) => ({
          symbol: p.baseToken?.symbol,
          price_usd: p.priceUsd,
          volume_24h: p.volume?.h24,
        }))
      );
    },
  },
  {
    name: 'get_wallet_analytics',
    description: 'Get full token portfolio and total value for a Solana wallet.',
    schema: z.object({ wallet: z.string().describe('Solana wallet address') }),
    handler: async (_agent: any, args: any) => {
      const key = process.env.HELIUS_API_KEY ?? '';
      const res = await axios.get(
        `https://api.helius.xyz/v0/addresses/${args.wallet}/balances?api-key=${key}`
      );
      return JSON.stringify({
        sol: res.data.nativeBalance / 1e9,
        tokens: res.data.tokens?.slice(0, 20),
      });
    },
  },
  {
    name: 'check_token_risk',
    description: 'Assess on-chain risk of a Solana token (Green/Yellow/Red) using Rugcheck.',
    schema: z.object({ mint: z.string().describe('Token mint address') }),
    handler: async (_agent: any, args: any) => {
      const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${args.mint}/report/summary`);
      return JSON.stringify(res.data);
    },
  },
  {
    name: 'parse_transaction',
    description: 'Get a human-readable breakdown of any Solana transaction by signature.',
    schema: z.object({ signature: z.string().describe('Transaction signature') }),
    handler: async (_agent: any, args: any) => {
      const key = process.env.HELIUS_API_KEY ?? '';
      const res = await axios.post(
        `https://api.helius.xyz/v0/transactions/?api-key=${key}`,
        { transactions: [args.signature] }
      );
      const tx = res.data?.[0];
      return JSON.stringify({
        type: tx?.type,
        description: tx?.description,
        fee: tx?.fee / 1e9,
      });
    },
  },
];
