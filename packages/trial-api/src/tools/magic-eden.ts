import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

const ME_BASE = 'https://api-mainnet.magiceden.dev/v2';

// ── Tool 1: Collection Stats ────────────────────────────────────────────────

const StatsInput = z.object({
  collection: z.string().describe('NFT collection symbol, e.g. "mad_lads", "tensorians"'),
});

const StatsOutput = z.object({
  floor_price_sol: z.number(),
  listed_count: z.number(),
  volume_24h: z.number(),
  avg_price_24h: z.number(),
  cached: z.boolean(),
});

export const getMagicEdenCollectionStats = createTool({
  id: 'get_magic_eden_collection_stats',
  description:
    'Get floor price, volume, and sales stats for an NFT collection on Magic Eden. ' +
    'Call this when the user asks about NFT floor prices or collection stats.',
  inputSchema: StatsInput,
  outputSchema: StatsOutput,
  execute: async ({ context }) => {
    const { collection } = StatsInput.parse(context);

    return withCache(`me_stats_${collection}`, 120, async () => {
      const res = await axios.get(
        `${ME_BASE}/collections/${collection}/stats`,
        { timeout: 8000 }
      );

      const data = res.data;
      return {
        floor_price_sol: (data.floorPrice ?? 0) / 1e9,
        listed_count: data.listedCount ?? 0,
        volume_24h: (data.volume24hr ?? 0) / 1e9,
        avg_price_24h: (data.avgPrice24hr ?? 0) / 1e9,
      };
    });
  },
});

// ── Tool 2: Popular Collections ─────────────────────────────────────────────

const PopularInput = z.object({
  limit: z.number().int().min(1).max(20).default(10).describe('Number of collections to return'),
});

const PopularOutput = z.object({
  collections: z.array(z.object({
    symbol: z.string(),
    name: z.string(),
    floor_price_sol: z.number(),
    volume_1d: z.number(),
  })),
  cached: z.boolean(),
});

export const getMagicEdenPopularCollections = createTool({
  id: 'get_magic_eden_popular_collections',
  description:
    'Get trending/popular NFT collections on Magic Eden. ' +
    'Call this when the user asks about trending NFTs or popular collections.',
  inputSchema: PopularInput,
  outputSchema: PopularOutput,
  execute: async ({ context }) => {
    const { limit } = PopularInput.parse(context);

    return withCache('me_popular', 300, async () => {
      const validLimit = limit <= 50 ? 50 : 100;
      const res = await axios.get(
        `${ME_BASE}/marketplace/popular_collections`,
        { params: { timeRange: '1d', limit: validLimit }, timeout: 8000 }
      );

      const cols: any[] = res.data ?? [];
      return {
        collections: cols.slice(0, limit).map((c: any) => ({
          symbol: c.symbol ?? '',
          name: c.name ?? 'Unknown',
          floor_price_sol: (c.floorPrice ?? 0) / 1e9,
          volume_1d: (c.volume1d ?? 0) / 1e9,
        })),
      };
    });
  },
});

// ── Tool 3: Listings ────────────────────────────────────────────────────────

const ListingsInput = z.object({
  collection: z.string().describe('NFT collection symbol'),
  limit: z.number().int().min(1).max(20).default(5).describe('Number of listings'),
});

const ListingsOutput = z.object({
  listings: z.array(z.object({
    price_sol: z.number(),
    token_address: z.string(),
    listed_at: z.string(),
  })),
  cached: z.boolean(),
});

export const getMagicEdenListings = createTool({
  id: 'get_magic_eden_listings',
  description:
    'Get active listings for an NFT collection on Magic Eden. ' +
    'Call this when the user wants to see what NFTs are for sale in a collection.',
  inputSchema: ListingsInput,
  outputSchema: ListingsOutput,
  execute: async ({ context }) => {
    const { collection, limit } = ListingsInput.parse(context);

    return withCache(`me_listings_${collection}_${limit}`, 60, async () => {
      const res = await axios.get(
        `${ME_BASE}/collections/${collection}/listings`,
        { params: { offset: 0, limit }, timeout: 8000 }
      );

      const raw: any[] = res.data ?? [];
      return {
        listings: raw.slice(0, limit).map((l: any) => ({
          price_sol: (l.price ?? 0) / 1e9,
          token_address: l.tokenAddress ?? '',
          listed_at: l.listedAt ?? '',
        })),
      };
    });
  },
});
