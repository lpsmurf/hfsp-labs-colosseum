import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT:              z.string().default('3001'),
  NODE_ENV:          z.string().default('development'),
  // Solana wallet — receives Solana USDC payments + signs bridge txs
  WALLET_PUBLIC_KEY:  z.string().min(32),
  WALLET_PRIVATE_KEY: z.string().min(32),   // base58
  HELIUS_API_KEY:     z.string().min(1),
  // EVM wallet — receives Base USDC payments
  EVM_WALLET_ADDRESS:     z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  EVM_WALLET_PRIVATE_KEY: z.string().min(60),
  BASE_RPC_URL:           z.string().default('https://mainnet.base.org'),
  // Redis session store
  REDIS_URL:         z.string().default('redis://localhost:6379'),
  // Gnosis Pay partner credentials (partners.gnosispay.com)
  GP_PARTNER_ID:     z.string().default(''),
  GP_APP_ID:         z.string().default(''),
  GP_API_URL:        z.string().default('https://api.gnosispay.com'),
  // Relay.link — direct bridge to Gnosis (~5s), supports Solana + Base sources
  RELAY_API_URL:     z.string().default('https://api.relay.link'),
  // Service fees
  TOPUP_FEE_PCT:     z.string().default('0.5'),
  ONBOARD_FEE_USDC:  z.string().default('5'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Missing required environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

// Solana
export const USDC_MINT  = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`;

// Base
export const BASE_USDC  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_CHAIN_ID   = 8453;
export const SOLANA_CHAIN_ID = 792703809;
export const GNOSIS_CHAIN_ID = 100;

// Gnosis Chain tokens
export const GNOSIS_TOKENS = {
  USDCe: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
  EURe:  '0xcB444e90D8198415266c6a2724b7900fb12FC56E',
  GBPe:  '0x5Cb9073902F2035222B9749F8fB0c9BFe5527108',
} as const;

export type GnosisToken  = keyof typeof GNOSIS_TOKENS;
export type SourceChain  = 'solana' | 'base';
