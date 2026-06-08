import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT:                z.string().default('3008'),
  NODE_ENV:            z.string().default('development'),

  // Base (EVM) payment
  BASE_RPC_URL:            z.string().default('https://mainnet.base.org'),
  PAYMENT_RECIPIENT_BASE:  z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address'),

  // Solana payment
  SOLANA_RPC_URL:          z.string().default('https://api.mainnet-beta.solana.com'),
  PAYMENT_RECIPIENT_SOL:   z.string().min(32, 'Must be a valid Solana base58 address'),

  GITHUB_TOKEN:        z.string().optional(),
  // ACE Data Cloud — OpenAI via x402 (used for AI feedback on audit findings)
  ACEDATA_API_KEY:               z.string().optional(),
  ACEDATA_FACILITATOR_ADDRESS:   z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Missing required environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const BASE_USDC        = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const AUDIT_PRICE_USDC = 0.99;
