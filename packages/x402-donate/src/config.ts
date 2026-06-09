import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT:         z.string().default('3007'),
  NODE_ENV:     z.string().default('development'),
  BASE_RPC_URL: z.string().default('https://mainnet.base.org'),

  // DonationRouter contract — deployed on Base, receives all donor USDC
  ROUTER_CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address'),
  // EOA that calls route() — must match the `router` param passed at deploy time
  ROUTER_PRIVATE_KEY: z.string().min(60, 'Must be a hex private key (64 chars)'),
  // Treasury wallet that receives the 3% fee
  TREASURY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Missing required environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const BASE_USDC     = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_CHAIN_ID = 8453;

export const FEES = {
  endaomentAdminPct: 1.5,
  servicePct:        3,    // our 3% — enforced on-chain in DonationRouter
  gasEstimateUsd:    0.001,
} as const;
