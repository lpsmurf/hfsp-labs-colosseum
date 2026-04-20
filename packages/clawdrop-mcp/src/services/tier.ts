/**
 * Clawdrop Tier Service
 * Handles tier listing and quoting with dynamic SOL pricing
 */

import axios from "axios";
import { getPaymentQuote } from "./payment";
import { logger } from "../utils/logger";

export interface Tier {
  id: string;
  name: string;
  description: string;
  vps_type: "shared-docker" | "dedicated-vps";
  vps_capacity: string;
  price_usd: number;
  bundles_included: string[];
  max_agents: number;
  monthly_renewal: boolean;
}

// ─── Dynamic SOL Price Fetching ─────────────────────────────────────────────

interface SolPriceCache {
  price: number;
  timestamp: number;
}

let solPriceCache: SolPriceCache | null = null;
const SOL_PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current SOL/USD price from Jupiter API
 * Falls back to Birdeye, then CoinGecko
 */
export async function getSolPrice(): Promise<number> {
  // Return cached price if still valid
  if (solPriceCache && Date.now() - solPriceCache.timestamp < SOL_PRICE_CACHE_TTL) {
    return solPriceCache.price;
  }

  const sources = [
    // Jupiter Price API
    async () => {
      const res = await axios.get('https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112', { timeout: 5000 });
      const price = res.data?.data?.So11111111111111111111111111111111111111112?.price;
      if (!price) throw new Error('Jupiter: no price');
      return price;
    },
    // Birdeye fallback
    async () => {
      const res = await axios.get('https://public-api.birdeye.so/defi/price?token_address=So11111111111111111111111111111111111111112', {
        headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY || 'demo' },
        timeout: 5000,
      });
      const price = res.data?.data?.value || res.data?.price;
      if (!price) throw new Error('Birdeye: no price');
      return price;
    },
    // CoinGecko fallback
    async () => {
      const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { timeout: 5000 });
      const price = res.data?.solana?.usd;
      if (!price) throw new Error('CoinGecko: no price');
      return price;
    },
  ];

  for (let i = 0; i < sources.length; i++) {
    try {
      const price = await sources[i]();
      solPriceCache = { price, timestamp: Date.now() };
      const sourceName = i === 0 ? 'jupiter' : i === 1 ? 'birdeye' : 'coingecko';
      logger.info({ price, source: sourceName }, 'Fetched SOL price');
      return price;
    } catch (err: any) {
      logger.warn({ source: i, error: err.message }, 'SOL price source failed, trying next');
    }
  }

  // All sources failed - use hardcoded fallback
  logger.error('All SOL price sources failed, using fallback $150/SOL');
  return 150; // Conservative fallback
}

/**
 * Calculate SOL amount from USD price
 * Includes 5% buffer for price fluctuation during tx
 */
export function calculateSolAmount(usdPrice: number, solPriceUsd: number): number {
  const buffer = 1.05;
  const solAmount = (usdPrice * buffer) / solPriceUsd;
  return Math.round(solAmount * 10000) / 10000; // 4 decimal places
}

// ─── Tier Definitions (USD only, SOL calculated dynamically) ──────────────

const TIERS: Record<string, Tier> = {
  tier_explorer: {
    id: "tier_explorer",
    name: "🌱 Explorer",
    description: "Shared container for experimenting — try Clawdrop before committing",
    vps_type: "shared-docker",
    vps_capacity: "1.5GB RAM, 0.5 vCPU, Shared",
    price_usd: 9, // $9/mo (aligned with storefront Pro subscription)
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"],
    max_agents: 1,
    monthly_renewal: true,
  },

  tier_a: {
    id: "tier_a",
    name: "🚀 Production",
    description: "Dedicated VPS for serious agents",
    vps_type: "dedicated-vps",
    vps_capacity: "4GB RAM, 2 vCPU, Dedicated",
    price_usd: 29, // $29/mo
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"],
    max_agents: 1,
    monthly_renewal: true,
  },

  tier_b: {
    id: "tier_b",
    name: "🏢 Enterprise",
    description: "Custom infrastructure with SLA",
    vps_type: "dedicated-vps",
    vps_capacity: "16GB RAM, 4 vCPU, Dedicated",
    price_usd: 99, // $99/mo
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"],
    max_agents: 5,
    monthly_renewal: true,
  },
};

/**
 * Get tier with dynamically calculated SOL price
 */
export async function getTierWithPrice(tier_id: string): Promise<Tier & { price_sol: number }> {
  const tier = getTier(tier_id);
  if (!tier) {
    throw new Error(`Unknown tier: ${tier_id}`);
  }

  const solPrice = await getSolPrice();
  const price_sol = calculateSolAmount(tier.price_usd, solPrice);

  return {
    ...tier,
    price_sol,
  };
}

/**
 * List all tiers with dynamic SOL pricing
 */
export async function listTiersWithPrices(): Promise<(Tier & { price_sol: number })[]> {
  const solPrice = await getSolPrice();
  return Object.values(TIERS).map(tier => ({
    ...tier,
    price_sol: calculateSolAmount(tier.price_usd, solPrice),
  }));
}

/**
 * List all available tiers (legacy, returns cached SOL price)
 */
export function listTiers(): Tier[] {
  return Object.values(TIERS);
}

/**
 * Get tier by ID
 */
export function getTier(tier_id: string): Tier | null {
  return TIERS[tier_id] || null;
}

/**
 * Get tier price in SOL (dynamically calculated)
 */
export async function getTierPrice(tier_id: string): Promise<number> {
  const tier = await getTierWithPrice(tier_id);
  return tier.price_sol;
}

/**
 * Get detailed quote for a tier with payment options
 */
export async function quoteTier(
  tier_id: string,
  payment_token: string = "SOL"
): Promise<{
  tier: Tier & { price_sol: number };
  payment: any;
  bundles_available: string[];
}> {
  const tier = await getTierWithPrice(tier_id);
  if (!tier) {
    throw new Error(`Unknown tier: ${tier_id}`);
  }

  // Get payment quote with dynamically calculated SOL price
  const paymentQuote = await getPaymentQuote(tier_id, tier.price_sol, payment_token);

  return {
    tier,
    payment: paymentQuote,
    bundles_available: ["solana", "research", "treasury"],
  };
}

/**
 * Validate bundle combination is valid for tier
 */
export function validateBundles(tier_id: string, bundles: string[]): boolean {
  const tier = getTier(tier_id);
  if (!tier) {
    return false;
  }

  const validBundles = ["solana", "research", "treasury", "travel-crypto-pro"];
  return bundles.every((b) => validBundles.includes(b));
}

/**
 * Get max agents for tier
 */
export function getMaxAgents(tier_id: string): number {
  const tier = getTier(tier_id);
  return tier?.max_agents || 1;
}

/**
 * Get current SOL price info for display
 */
export async function getSolPriceInfo(): Promise<{ price: number; source: string; cached: boolean }> {
  const isCached = solPriceCache !== null && Date.now() - solPriceCache.timestamp < SOL_PRICE_CACHE_TTL;
  const price = await getSolPrice();
  return {
    price,
    source: isCached ? 'cache' : 'live',
    cached: isCached,
  };
}
