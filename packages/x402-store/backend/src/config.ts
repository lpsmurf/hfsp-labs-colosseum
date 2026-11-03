import { z } from "zod";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Resolve .env relative to this file so it loads correctly regardless of cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const env = z.object({
  // Our Solana operator address — receives USDC from agents (public key)
  OPERATOR_SOLANA_ADDRESS: z.string().min(32),

  // Our Solana private key — used to pay Cryptorefills on behalf of agents
  // base58-encoded 64-byte Ed25519 secret key. NEVER log or expose.
  STORE_SOLANA_PRIVATE_KEY: z.string().min(87).max(88),
  PUBLIC_BASE_URL: z.string().url().default("https://store.hfsp.cloud"),
  // Used by paysolana.ts to fetch blockhash. Defaults to HELIUS_RPC_URL if unset.
  SOLANA_RPC_URL: z.string().url().optional(),

  // Helius RPC for Solana payment verification
  HELIUS_RPC_URL: z.string().url(),

  // Commission added on top of Cryptorefills price (0.025 = 2.5%)
  COMMISSION_RATE: z.coerce.number().min(0).max(0.5).default(0.025),

  // Cryptorefills x402 host
  CR_HOST: z.string().url().default("https://x402.cryptorefills.com"),

  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  PORT:      z.coerce.number().default(3002),
  NODE_ENV:  z.enum(["production", "development", "test"]).default("production"),
  DEV_MODE:  z.string().transform(s => s === "true").default("false"),

  // Agent wallets — pay micro-price for testing
  AGENT_WALLETS: z.string().default(""),

  // Shared secret for the internal /api/internal/* endpoints.
  // Set the same value in gnosis-card-x402 (STORE_INTERNAL_KEY).
  INTERNAL_KEY: z.string().min(16).optional(),
}).parse(process.env);

export default env;
