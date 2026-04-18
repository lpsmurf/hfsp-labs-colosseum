import { z } from 'zod';

/**
 * Tier Model - represents a service tier available for deployment
 * Renamed from "Service" to clarify this is a tier in the pricing/capability structure
 */

export const TierSchema = z.object({
  id: z.string().describe('Tier identifier (e.g., "travel-crypto-pro")'),
  name: z.string().describe('Human-readable tier name'),
  description: z.string().describe('Tier description'),
  category: z.enum(['agent', 'wallet', 'treasury', 'research', 'finance']),
  capability_bundle: z.string().describe('Capability bundle name'),
  features: z.array(z.string()).describe('List of features included'),
  price_sol: z.number().positive().describe('Price in SOL'),
  price_herd: z.number().positive().describe('Price in HERD'),
  deployment_type: z.enum(['openclaw', 'custom']),
  created_at: z.date().optional(),
});

export type Tier = z.infer<typeof TierSchema>;
