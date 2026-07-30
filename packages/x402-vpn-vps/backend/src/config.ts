import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();

const env = z.object({
  // Solana operator address — RECIPIENT only, no private keys needed in the backend
  OPERATOR_SOLANA_ADDRESS: z.string().min(32).default("GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY"),

  // Helius RPC — on-chain verification for the legacy X-Solana-Tx payment path.
  // This must be set to a valid URL including your API key.
  HELIUS_RPC_URL: z.string().url(),

  // x402 V2 facilitator. PayAI serves x402Version 2 `exact` on Solana mainnet —
  // verified 2026-07-29 — which is what finally made the SDK path possible here.
  FACILITATOR_URL: z.string().url().default("https://facilitator.payai.network"),

  HETZNER_API_TOKEN: z.string().min(1),
  REDIS_URL:         z.string().url().default("redis://localhost:6379"),
  PORT:              z.coerce.number().default(3001),
  NODE_ENV:          z.enum(["production", "development", "test"]).default("production"),
  // z.coerce.boolean() treats the string "false" as truthy — use transform instead
  DEV_MODE: z.string().transform(s => s === "true").default("false"),

  // Agent wallets — comma-separated Solana addresses that pay micro-price ($0.0001)
  AGENT_WALLETS: z.string().default(""),
}).parse(process.env);

export default env;
