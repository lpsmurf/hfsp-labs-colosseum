import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT:              z.string().default('3001'),
  NODE_ENV:          z.string().default('development'),
  // Solana wallet that receives USDC payments + signs bridge txs
  WALLET_PUBLIC_KEY:  z.string().min(32),
  WALLET_PRIVATE_KEY: z.string().min(32),   // base58 — used to sign deBridge orders
  HELIUS_API_KEY:     z.string().min(1),
  // Redis session store
  REDIS_URL:         z.string().default('redis://localhost:6379'),
  // Gnosis Pay partner credentials (partners.gnosispay.com)
  GP_PARTNER_ID:     z.string().default(''),
  GP_APP_ID:         z.string().default(''),
  GP_API_URL:        z.string().default('https://api.gnosispay.com'),
  // deBridge DLN — Solana→Gnosis bridge
  DBRIDGE_API_URL:   z.string().default('https://api.dln.trade/v1.0'),
  // Service fees
  TOPUP_FEE_PCT:     z.string().default('0.5'),   // 0.5% over bridge amount
  ONBOARD_FEE_USDC:  z.string().default('5'),     // flat $5 USDC onboarding fee
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Missing required environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`;

// deBridge DLN chain IDs
export const CHAIN_IDS = {
  SOLANA: 7565164,
  GNOSIS: 100,
} as const;

// Token addresses on Gnosis Chain
export const GNOSIS_TOKENS = {
  USDCe: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // USDC bridged via Gnosis Bridge
  EURe:  '0xcB444e90D8198415266c6a2724b7900fb12FC56E', // Monerium EURe
  GBPe:  '0x5Cb9073902F2035222B9749F8fB0c9BFe5527108', // Monerium GBPe
} as const;

export type GnosisToken = keyof typeof GNOSIS_TOKENS;
