/**
 * demo.ts — proof-it-runs for the prep kit.
 *
 * Runs with ZERO API keys: it (1) self-tests the SpendGuard guardrail logic and
 * (2) dry-runs the autonomy loop, printing the exact provider call shapes it
 * WOULD make. If the relevant env keys are present it notes the call is live-
 * capable. Nothing here spends money — this is a wiring + shape demonstration.
 *
 *   npm run demo        # or: npx tsx demo.ts
 */

import "dotenv/config";
import { SpendGuard, type SpendCaps } from "./spend-guard.js";
import { fromAtomicUsdc, toAtomicUsdc } from "./providers.js";
import { KeepaClient } from "./keepa-client.js";
import { CrossmintClient } from "./crossmint-client.js";
import { MODELS } from "./llm-x402-client.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 56 - title.length))}`);
}

// ── 1. SpendGuard self-test (no network, no keys) ────────────────────────────
section("SpendGuard guardrails (self-test)");

const caps: SpendCaps = {
  perTxAtomic: toAtomicUsdc(200), // $200 single-tx ceiling
  dailyAtomic: toAtomicUsdc(500), // $500 rolling 24h ceiling
  humanConfirmAtomic: toAtomicUsdc(100), // buys ≥ $100 need user OK
  allowMerchantPrefixes: ["amazon:", "giftcard:"],
};
let clock = 1_700_000_000_000;
const guard = new SpendGuard(caps, () => clock);

const infer = guard.check({ kind: "inference", amountAtomic: toAtomicUsdc(0.0003) });
assert(infer.allow && !infer.requiresHumanConfirm, "tiny inference payment is allowed, no confirm");

const small = guard.check({ kind: "purchase", amountAtomic: toAtomicUsdc(40), merchant: "amazon:B01DFKC2SO" });
assert(small.allow === true && small.requiresHumanConfirm === false, "$40 Amazon buy allowed without confirm");

const big = guard.check({ kind: "purchase", amountAtomic: toAtomicUsdc(150), merchant: "amazon:B01DFKC2SO" });
assert(big.allow === true && big.requiresHumanConfirm === true, "$150 buy allowed but flagged for human confirm");

const overTx = guard.check({ kind: "purchase", amountAtomic: toAtomicUsdc(250), merchant: "amazon:B01DFKC2SO" });
assert(overTx.allow === false, "$250 buy blocked by per-tx cap");

const badMerchant = guard.check({ kind: "purchase", amountAtomic: toAtomicUsdc(10), merchant: "sketchy:xyz" });
assert(badMerchant.allow === false, "non-allowlisted merchant blocked");

// Daily cap: commit $400, then a $150 buy should breach the $500/24h ceiling.
guard.commit({ kind: "purchase", amountAtomic: toAtomicUsdc(400), merchant: "amazon:A" });
const overDaily = guard.check({ kind: "purchase", amountAtomic: toAtomicUsdc(150), merchant: "amazon:B" });
assert(overDaily.allow === false, "buy blocked by rolling daily cap after $400 spent");

clock += 25 * 60 * 60 * 1000; // advance 25h — window rolls off
const afterRoll = guard.check({ kind: "purchase", amountAtomic: toAtomicUsdc(150), merchant: "amazon:B" });
assert(afterRoll.allow === true, "same buy allowed once the 24h window rolls off");

// ── 2. Autonomy-loop dry run (prints planned provider calls) ─────────────────
section("Autonomy loop — planned provider calls (dry run)");

const have = (k: string) => (process.env[k] ? "LIVE-capable (key present)" : "DRY (set key in .env to go live)");

// provision inbox
console.log(`\n[1] Provision agent email  ·  AgentMail`);
console.log(`    POST https://api.agentmail.to/v0/inboxes  { client_id: "shopper-<agentId>" }`);
console.log(`    status: ${have("AGENTMAIL_API_KEY")}`);

// watch price
console.log(`\n[2] Watch price  ·  Keepa`);
if (process.env.KEEPA_API_KEY) {
  const keepa = new KeepaClient({ apiKey: process.env.KEEPA_API_KEY, domain: "US" });
  console.log(`    GET ${keepa.productUrl("B01DFKC2SO").replace(process.env.KEEPA_API_KEY, "***")}`);
} else {
  console.log(`    GET https://api.keepa.com/product?key=***&domain=1&asin=B01DFKC2SO&stats=180&history=1`);
}
console.log(`    status: ${have("KEEPA_API_KEY")}`);

// pay-for-LLM decision
console.log(`\n[3] Rank + decide  ·  BlockRun SolanaLLMClient (x402, self-funded)`);
console.log(`    models: classify=${MODELS.classify}  decide=${MODELS.decide}`);
console.log(`    pays per request in Solana USDC from the agent wallet — no API key`);
console.log(`    status: ${process.env.SOLANA_WALLET_KEY ? "LIVE-capable (wallet present)" : "DRY (set SOLANA_WALLET_KEY)"}`);

// buy
console.log(`\n[4] Buy + pay  ·  Crossmint (Amazon, crypto checkout)`);
if (process.env.CROSSMINT_API_KEY && process.env.SOLANA_WALLET_KEY && process.env.HELIUS_RPC_URL) {
  const xmint = new CrossmintClient({
    apiKey: process.env.CROSSMINT_API_KEY,
    walletSecretKey: process.env.SOLANA_WALLET_KEY,
    rpcUrl: process.env.HELIUS_RPC_URL,
    env: "staging",
  });
  const body = xmint.buildOrderBody({
    productLocator: "amazon:B01DFKC2SO",
    recipientEmail: "user@example.com",
    shipTo: { name: "Jane Doe", line1: "123 Main St", city: "San Francisco", state: "CA", postalCode: "94105", country: "US" },
    maxTotalUsd: 50,
  });
  console.log(`    POST <crossmint>/orders`);
  console.log(`    ${JSON.stringify(body)}`);
  console.log(`    payer: ${xmint.payerAddress}`);
} else {
  console.log(`    POST https://staging.crossmint.com/api/2022-06-09/orders`);
  console.log(`    body: { recipient{email,physicalAddress}, payment{method:"solana",currency:"usdc",payerAddress}, lineItems:[{productLocator:"amazon:B01DFKC2SO"}] }`);
}
console.log(`    ⚠ chain-split: live docs show Amazon settling on Base/EVM USDC, not Solana — verify before mainnet`);
console.log(`    status: ${have("CROSSMINT_API_KEY")}`);

// report
console.log(`\n[5] Report  ·  AgentMail reply + Telegram (reused from clawdrop-agent-runtime)`);
console.log(`    emails/Telegrams the user a receipt + low-balance alert when wallet runs low`);

section("Summary");
console.log(`  guardrails: PASS   ·   wallet caps per-tx=$${fromAtomicUsdc(caps.perTxAtomic)} daily=$${fromAtomicUsdc(caps.dailyAtomic)} confirm≥$${fromAtomicUsdc(caps.humanConfirmAtomic)}`);
console.log(`  loop wired: provision-inbox → watch → decide(pay-LLM) → buy(pay) → report`);
console.log(`  set keys in .env (see .env.example) to turn DRY steps LIVE.\n`);
