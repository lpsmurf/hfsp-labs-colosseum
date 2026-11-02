// usage: tsx scripts/bridge-execute.ts <srcToken> <amountIn> <destChain> <destToken> [flags]
//   flags: --provider=<name>  --accept-slippage=<bps>  --confirm
// Aggregate -> safety preflight -> re-quote guard -> PLAN preview. Broadcasts ONLY with --confirm.
// Without --confirm it never moves funds: it prints exactly what would happen and stops.
import "./env.js";
import { preflight, requoteGuard } from "./bridge-safety.js";
import { aggregate } from "./bridge-aggregator.js";
import { PROVIDERS } from "./providers.js";
import type { EvmChain } from "./types.js";

const redact = (u?: string) => (u ?? "").replace(/api-key=[^&]+/i, "api-key=***");

// Derive the configured wallet addresses for the plan (public info only).
async function walletAddrs() {
  let sol = "(SOLANA_WALLET_PRIVATE_KEY not set)";
  let evm = "(EVM_WALLET_PRIVATE_KEY not set)";
  try {
    if (process.env.SOLANA_WALLET_PRIVATE_KEY) {
      const web3: any = await import("@solana/web3.js");
      const bs58 = (await import("bs58")).default;
      sol = web3.Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY)).publicKey.toBase58();
    }
  } catch { /* leave placeholder */ }
  try {
    if (process.env.EVM_WALLET_PRIVATE_KEY) {
      const { privateKeyToAccount } = await import("viem/accounts");
      evm = privateKeyToAccount(process.env.EVM_WALLET_PRIVATE_KEY as `0x${string}`).address;
    }
  } catch { /* leave placeholder */ }
  return { sol, evm };
}

async function run(
  srcToken: string,
  amountIn: number,
  chain: EvmChain,
  destToken: string,
  opts: { acceptSlippageBps?: number; confirm?: boolean; provider?: string },
) {
  // 1. Best route (or a pinned provider).
  const { best, ranked } = await aggregate(srcToken, amountIn, chain, destToken);
  const chosen = opts.provider ? ranked.find((q) => q.provider === opts.provider) : best;
  if (!chosen) throw new Error(opts.provider ? `provider '${opts.provider}' not eligible for this route` : "No eligible route");

  // 2. Mandatory preflight (allowlist, caps, RPC health, swap slippage protection).
  const safety = await preflight(srcToken, amountIn, chain, destToken, chosen, { acceptSlippageBps: opts.acceptSlippageBps });
  if (!safety.ok) throw new Error("Safety preflight failed: " + safety.failures.join("; "));

  // 3. Re-quote right before execute; abort swaps that drifted below minAmountOut.
  const rq = await requoteGuard(srcToken, amountIn, chain, destToken, chosen);
  if (!rq.ok) throw new Error("Re-quote guard blocked execution: " + rq.reason);

  // 4. Plan preview (no funds moved).
  const { sol, evm } = await walletAddrs();
  console.log("=== BRIDGE PLAN ===");
  console.log(JSON.stringify({
    provider: chosen.provider,
    route: chosen.route,
    kind: chosen.kind,
    amountIn: `${amountIn} ${srcToken}`,
    expectedOut: `${chosen.amountOut} ${destToken}`,
    minReceived: `${chosen.minAmountOut} ${destToken}`,
    fee: `${chosen.bridgeFeeUSDC} (${chosen.bridgeFeeBps.toFixed(1)} bps)`,
    from: sol,
    to: evm,
    destChain: chain,
    etaSeconds: chosen.etaSeconds,
    solanaRpc: redact(safety.usedRpc),
  }, null, 2));

  // 5. Broadcast only on explicit --confirm.
  if (!opts.confirm) {
    console.log("\nDRY-RUN — no funds moved. Re-run with --confirm to broadcast (moves REAL funds).");
    return;
  }
  console.log("\n--confirm set → broadcasting via", chosen.provider, "...");
  const result = await PROVIDERS[chosen.provider].execute(srcToken, amountIn, chain, destToken);
  console.log("=== EXECUTED ===");
  console.log(JSON.stringify(result, null, 2));
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const accArg = args.find((a) => a.startsWith("--accept-slippage="));
const provArg = args.find((a) => a.startsWith("--provider="));
const acceptSlippageBps = accArg ? Number(accArg.split("=")[1]) : undefined;
const provider = provArg ? provArg.split("=")[1] : undefined;
const [srcToken, amountIn, chain, destToken] = args.filter((a) => !a.startsWith("--"));

run(srcToken, Number(amountIn), chain as EvmChain, destToken, { acceptSlippageBps, confirm, provider })
  .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
