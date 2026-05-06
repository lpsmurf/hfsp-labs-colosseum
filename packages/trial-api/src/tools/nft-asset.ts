import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com';

// ── Tool 1: Get NFT Asset ───────────────────────────────────────────────────

const AssetInput = z.object({
  mint: z.string().describe('NFT mint address'),
});

const AssetOutput = z.object({
  name: z.string(),
  symbol: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  collection: z.string().optional(),
  attributes: z.array(z.object({ trait_type: z.string(), value: z.string() })),
  cached: z.boolean(),
});

export const getNFTAsset = createTool({
  id: 'get_nft_asset',
  description:
    'Get metadata for a single NFT by its mint address via Helius DAS API. ' +
    'Call this when the user provides an NFT mint and wants details (name, image, traits, collection).',
  inputSchema: AssetInput,
  outputSchema: AssetOutput,
  execute: async ({ context }) => {
    const { mint } = AssetInput.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) return { name: 'Unknown', symbol: undefined, description: undefined, image: undefined, collection: undefined, attributes: [], cached: false };

    return withCache(`nft_${mint}`, 3600, async () => {
      const res = await axios.post(
        `${HELIUS_RPC}/?api-key=${apiKey}`,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'getAsset',
          params: { id: mint },
        },
        { timeout: 10000 }
      );

      const result = res.data?.result;
      if (!result) throw new Error('NFT not found');

      const meta = result.content?.metadata ?? {};
      const grouping = result.grouping ?? [];
      const collection = grouping.find((g: any) => g.group_key === 'collection')?.group_value;

      return {
        name: meta.name ?? 'Unknown',
        symbol: meta.symbol ?? undefined,
        description: meta.description ?? undefined,
        image: result.content?.links?.image ?? undefined,
        collection: collection ?? undefined,
        attributes: meta.attributes ?? [],
      };
    });
  },
});

// ── Tool 2: Search NFT Assets ───────────────────────────────────────────────

const SearchInput = z.object({
  wallet: z.string().describe('Solana wallet address'),
  limit: z.number().int().min(1).max(50).default(10).describe('Max NFTs to return'),
});

const SearchOutput = z.object({
  wallet: z.string(),
  nfts: z.array(z.object({
    mint: z.string(),
    name: z.string(),
    collection: z.string().optional(),
  })),
  total: z.number(),
  cached: z.boolean(),
});

export const searchNFTAssets = createTool({
  id: 'search_nft_assets',
  description:
    'Search NFTs owned by a wallet via Helius DAS API. ' +
    'Call this when the user asks "what NFTs do I own" or wants to see their collection.',
  inputSchema: SearchInput,
  outputSchema: SearchOutput,
  execute: async ({ context }) => {
    const { wallet, limit } = SearchInput.parse(context);
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) return { wallet, nfts: [], total: 0, cached: false };

    return withCache(`nfts_${wallet}`, 120, async () => {
      const res = await axios.post(
        `${HELIUS_RPC}/?api-key=${apiKey}`,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'searchAssets',
          params: {
            ownerAddress: wallet,
            tokenType: 'nonFungible',
            page: 1,
            limit,
          },
        },
        { timeout: 10000 }
      );

      const items: any[] = res.data?.result?.items ?? [];
      const nfts = items.map((item: any) => ({
        mint: item.id ?? '',
        name: item.content?.metadata?.name ?? 'Unknown',
        collection: item.grouping?.find((g: any) => g.group_key === 'collection')?.group_value ?? undefined,
      }));

      return {
        wallet,
        nfts,
        total: res.data?.result?.total ?? nfts.length,
      };
    });
  },
});
