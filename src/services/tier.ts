/**
 * Clawdrop Tier Service
 * Handles tier listing and quoting
 */

import { getPaymentQuote } from "./payment";

export interface Tier {
  id: string;
  name: string;
  description: string;
  vps_type: "shared-docker" | "dedicated-vps";
  vps_capacity: string;
  price_sol: number;
  price_usd: number;
  bundles_included: string[];
  max_agents: number;
  monthly_renewal: boolean;
}

/**
 * Available tiers
 * Prices based on VPS capacity, NOT on bundles
 * All bundles available at any tier
 */
const TIERS: Record<string, Tier> = {
  tier_explorer: {
    id: "tier_explorer",
    name: "🌱 Explorer",
    description: "Shared container for experimenting — try Clawdrop before committing",
    vps_type: "shared-docker",
    vps_capacity: "1.5GB RAM, 0.5 vCPU, Shared",
    price_sol: 0.12, // ~$29/month at $250/SOL
    price_usd: 29,
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"],
    max_agents: 1,
    monthly_renewal: true,
  },

  tier_a: {
    id: "tier_a",
    name: "Tier A - Starter",
    description: "Shared Docker container, perfect for experiments and prototypes",
    vps_type: "shared-docker",
    vps_capacity: "2GB RAM, 1 vCPU, Shared",
    price_sol: 0.5, // ~$100/month at $200/SOL
    price_usd: 100,
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"], // All bundles available
    max_agents: 5,
    monthly_renewal: true,
  },

  tier_b: {
    id: "tier_b",
    name: "Tier B - Professional",
    description: "Dedicated VPS, for production-grade agents",
    vps_type: "dedicated-vps",
    vps_capacity: "4GB RAM, 2 vCPU, Dedicated",
    price_sol: 1.0, // ~$200/month at $200/SOL
    price_usd: 200,
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"], // All bundles available
    max_agents: 1,
    monthly_renewal: true,
  },

  tier_c: {
    id: "tier_c",
    name: "Tier C - Enterprise",
    description: "Custom VPS, contact for custom pricing",
    vps_type: "dedicated-vps",
    vps_capacity: "Custom",
    price_sol: 2.0, // Custom pricing
    price_usd: 400,
    bundles_included: ["solana", "research", "treasury", "travel-crypto-pro"],
    max_agents: 5,
    monthly_renewal: true,
  },
};

/**
 * List all available tiers
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
 * Get tier price in SOL
 */
export function getTierPrice(tier_id: string): number {
  const tier = getTier(tier_id);
  if (!tier) {
    throw new Error(`Unknown tier: ${tier_id}`);
  }
  return tier.price_sol;
}

/**
 * Get detailed quote for a tier with payment options
 */
export async function quoteTier(
  tier_id: string,
  payment_token: string = "SOL"
): Promise<{
  tier: Tier;
  payment: any; // PaymentQuote type from payment service
  bundles_available: string[];
}> {
  const tier = getTier(tier_id);
  if (!tier) {
    throw new Error(`Unknown tier: ${tier_id}`);
  }

  // Get payment quote with chosen token
  const paymentQuote = await getPaymentQuote(tier_id, tier.price_sol, payment_token);

  return {
    tier,
    payment: paymentQuote,
    bundles_available: ["solana", "research", "treasury"], // All bundles for MVP
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

  // For MVP: all bundles are available at all tiers
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
