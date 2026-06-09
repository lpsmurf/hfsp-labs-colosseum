import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();

const env = z.object({
  // Public base URL — load-bearing for x402 realm and MPP memo prefix
  BASE_URL: z.string().url().default("https://vpn-base.hfsp.cloud"),

  // Base operator address — RECIPIENT only, never a signer
  OPERATOR_BASE_ADDRESS: z.string().min(1).default("0xaF4991538332E3A037EF457BC635f0757ad61149"),

  FACILITATOR_URL:   z.string().url().default("https://x402.org/facilitator"),
  HETZNER_API_TOKEN: z.string().min(1),
  REDIS_URL:         z.string().url().default("redis://localhost:6379"),
  PORT:              z.coerce.number().default(3002),
  NODE_ENV:          z.enum(["production", "development", "test"]).default("production"),
  DEV_MODE:          z.string().transform(s => s === "true").default("false"),

  // MPP (Machine Payments Protocol) — optional; set all three vars to enable MPP alongside x402
  MPP_SECRET_KEY:    z.string().optional(),   // openssl rand -hex 32
  MPP_OPERATOR_KEY:  z.string().optional(),   // EVM private key (0x...) for signing MPP challenges
  MPP_FEE_PAYER_KEY: z.string().optional(),   // optional — subsidizes agent gas on Tempo chain
}).parse(process.env);

export default env;
