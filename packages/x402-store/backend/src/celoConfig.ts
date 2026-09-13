// Celo rail configuration. Optional: when any required value is missing the
// Celo routes are not mounted, and the existing Solana store is unaffected.
import { z } from "zod";
import "./config.js"; // loads .env

const schema = z.object({
  // One EVM key operates on both chains: receives x402 payments on Celo,
  // bridges, and pays Cryptorefills on Base. Hot wallet — keep balances small.
  STORE_EVM_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  CELO_FACILITATOR_API_KEY: z.string().startsWith("x402_"),
  // Wallet that owns the facilitator account; its credits pay for settlement.
  FACILITATOR_ACCOUNT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  // ERC-8021 attribution tag. Every transaction we send carries it; the
  // hackathon leaderboard credits nothing untagged and there is no backfill.
  ATTRIBUTION_TAG: z.string().regex(/^celo_[0-9a-f]{12}$/),
  CELO_RPC_URL: z.string().url().default("https://forno.celo.org"),
  BASE_RPC_URL: z.string().url().default("https://base-rpc.publicnode.com"),
  RELAY_API: z.string().url().default("https://api.relay.link"),
  // With a float, orders are paid from Base USDC already held and priced without
  // a bridge surcharge. Without one, each order is bridged and the bridge cost
  // is added to the buyer's price so small orders never run at a loss.
  STORE_FLOAT_MODE: z.string().transform(s => s === "true").default("false"),
  // Stop taking payments before credits run out: at zero the facilitator
  // refuses to settle and buyers would see a failed payment.
  MIN_FACILITATOR_CREDITS: z.coerce.number().int().min(0).default(3),
  // How long a quoted price holds between the 402 and the paid retry.
  PRICE_LOCK_SECONDS: z.coerce.number().int().min(30).max(600).default(240),
});

const parsed = schema.safeParse(process.env);
export const celoEnabled = parsed.success;
if (!parsed.success) {
  console.warn("[store] Celo rail disabled — missing or invalid:", Object.keys(parsed.error.flatten().fieldErrors).join(", "));
}
export const celoEnv = parsed.success ? parsed.data : (undefined as unknown as z.infer<typeof schema>);
