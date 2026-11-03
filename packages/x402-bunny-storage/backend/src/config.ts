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

  PUBLIC_BASE_URL: z.string().url().default("https://bunny-storage.hfsp.cloud"),

  // Helius RPC for Solana payment verification
  HELIUS_RPC_URL: z.string().url(),

  // Bunny.net Storage Zone credentials — see https://docs.bunny.net/reference/bunnynet-api-overview
  BUNNY_STORAGE_ZONE:     z.string().min(1),
  // Storage zone password, sent as the "AccessKey" header on every request
  BUNNY_STORAGE_PASSWORD: z.string().min(1),
  // Regional storage endpoint hostname (matches the zone's primary region)
  BUNNY_STORAGE_HOST:     z.string().default("storage.bunnycdn.com"),
  // Public pull-zone base URL used to build the returned CDN link, e.g. https://myzone.b-cdn.net
  BUNNY_PULL_ZONE_URL:    z.string().url(),

  // Pricing — USD per MB, atomic USDC has 6 decimals
  PRICE_PER_MB_USDC: z.coerce.number().positive().default(0.01),
  MIN_PRICE_USDC:    z.coerce.number().positive().default(0.005),
  MAX_UPLOAD_MB:     z.coerce.number().positive().default(200),

  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  PORT:      z.coerce.number().default(3003),
  NODE_ENV:  z.enum(["production", "development", "test"]).default("production"),
  DEV_MODE:  z.string().transform(s => s === "true").default("false"),
}).parse(process.env);

export default env;
