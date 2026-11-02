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

  // x402 V2 facilitator. Not x402.org — testnet only; these are mainnet routes
  // and @hfsp/x402-common refuses that combination at boot.
  FACILITATOR_URL:   z.string().url().default('https://facilitator.payai.network'),
  INTEGRATOR_FEE_BPS: z.string().default('15'),
  INTEGRATOR_FEE_ACCOUNT: z.string().default(''),
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
export const POLYGON_CHAIN_ID = 137;
export const ARBITRUM_CHAIN_ID = 42161;
export const ETHEREUM_CHAIN_ID = 1;

// Gnosis Chain tokens
// USDC: native Circle USDC on Gnosis (0x2a22...) — Gnosis Pay updated to this token
// USDCe (0xDDAf...) is the legacy bridged version, no longer used by Gnosis Pay
export const GNOSIS_TOKENS = {
  USDC:  '0x2a22f9c3b484c3629090feed35f17ff8f88f76f0',  // native Circle USDC (Gnosis Pay)
  EURe:  '0xcB444e90D8198415266c6a2724b7900fb12FC56E',  // Monerium EURe
  GBPe:  '0x5Cb9073902F2035222B9749F8fB0c9BFe5527108',  // Monerium GBPe
} as const;

export type GnosisToken  = keyof typeof GNOSIS_TOKENS;
export type SourceChain  = 'solana' | 'base';
export type BridgeDestChain = 'polygon' | 'gnosis' | 'base' | 'arbitrum' | 'ethereum';

export const BRIDGE_TARGETS = {
  polygon: {
    chainId: POLYGON_CHAIN_ID,
    finalitySeconds: 45,
    tokens: {
      USDC: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    },
  },
  gnosis: {
    chainId: GNOSIS_CHAIN_ID,
    finalitySeconds: 90,
    tokens: {
      USDC: GNOSIS_TOKENS.USDC,
      USDC_E: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
      EURe: GNOSIS_TOKENS.EURe,
      GBPe: GNOSIS_TOKENS.GBPe,
    },
  },
  base: {
    chainId: BASE_CHAIN_ID,
    finalitySeconds: 30,
    tokens: {
      USDC: BASE_USDC,
    },
  },
  arbitrum: {
    chainId: ARBITRUM_CHAIN_ID,
    finalitySeconds: 30,
    tokens: {
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
  },
  ethereum: {
    chainId: ETHEREUM_CHAIN_ID,
    finalitySeconds: 60,
    tokens: {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  },
} as const;
