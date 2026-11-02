// auto-bridge — the one-call "automatic best-route bridge".
// Aggregates every eligible provider, picks the best net route, runs the mandatory
// safety preflight, and (optionally) routes execution to the winning provider.
// Dry-run by DEFAULT: it never moves funds unless you pass --execute. It will NEVER
// execute without a passing bridge-safety preflight.
//
// usage:
//   tsx scripts/auto-bridge.ts <srcToken> <amountIn> <destChain> <destToken> [--execute]
//   tsx scripts/auto-bridge.ts USDC 5 polygon USDC            # dry-run: best route + safety, no funds moved
//   tsx scripts/auto-bridge.ts USDC 5 polygon USDC --execute  # route real funds via the winning provider
import "./env.js";
import { aggregate } from "./bridge-aggregator.js";
import { preflight, requoteGuard, describeSwapSlippage } from "./bridge-safety.js";
import { PROVIDERS } from "./providers.js";
import type { EvmChain, BridgeResult, SafetyResult } from "./types.js";
import type { ProviderQuote } from "./providers.js";

export interface AutoBridgeResult {
  mode: "dry-run" | "executed";
  chosen: ProviderQuote;
  ranked: ProviderQuote[];
  safety: SafetyResult;
  result?: BridgeResult;
  note?: string;
}

export async function autoBridge(
  srcToken: string,
  amountIn: number,
  destChain: EvmChain,
  destToken: string,
  opts: { execute?: boolean; acceptSlippageBps?: number } = {},
): Promise<AutoBridgeResult> {
  // 1. Shop every eligible provider, take the best net amount-out.
  const { best, ranked } = await aggregate(srcToken, amountIn, destChain, destToken);
  if (!best) throw new Error(`auto-bridge: no eligible route for ${srcToken} -> ${destToken} on ${destChain}`);

  // 2. Mandatory safety preflight (allowlist, caps, cross-chain RPC freshness, swap slippage). Fail loud.
  const safety = await preflight(srcToken, amountIn, destChain, destToken, best, { acceptSlippageBps: opts.acceptSlippageBps });
  if (!safety.ok) throw new Error("auto-bridge blocked by safety preflight: " + safety.failures.join("; "));

  // 3. Dry-run by default — never move funds unless explicitly told to.
  if (!opts.execute) {
    return { mode: "dry-run", chosen: best, ranked, safety, note: "dry-run only — pass --execute to route real funds via the winning provider" };
  }

  // 4. Re-quote right before execute; abort swaps that drifted below the minAmountOut floor.
  const rq = await requoteGuard(srcToken, amountIn, destChain, destToken, best);
  if (!rq.ok) throw new Error("auto-bridge blocked by re-quote guard: " + rq.reason);

  // 5. Route execution to the winning provider's adapter.
  const result = await PROVIDERS[best.provider].execute(srcToken, amountIn, destChain, destToken);
  return { mode: "executed", chosen: best, ranked, safety, result };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const accArg = args.find((a) => a.startsWith("--accept-slippage="));
  const acceptSlippageBps = accArg ? Number(accArg.split("=")[1]) : undefined;
  const [srcToken, amountIn, destChain, destToken] = args.filter((a) => !a.startsWith("--"));

  autoBridge(srcToken, Number(amountIn), destChain as EvmChain, destToken, { execute, acceptSlippageBps })
    .then((r) => {
      const c = r.chosen;
      const slip = describeSwapSlippage(c);
      const summary: Record<string, unknown> = {
        winner: c.provider,
        amountIn: `${c.amountIn} ${c.srcToken}`,
        amountOut: `${c.amountOut} ${c.destToken}`,
        route: c.route,
        fee: `${c.bridgeFeeUSDC} (${c.bridgeFeeBps.toFixed(1)} bps)`,
        etaSeconds: c.etaSeconds,
        safety: { ok: r.safety.ok, usedRpc: r.safety.usedRpc, slotLag: r.safety.rpcSlotLag },
      };
      if (slip.isSwap) {
        summary.slippageTolerance = `${slip.tolerancePct} (${slip.bps} bps)`;
        summary.minReceived = `${c.minAmountOut} ${c.destToken} (worst case)`;
      }
      console.log(`AUTO-BRIDGE [${r.mode}] — chose ${c.provider} (${c.kind})`);
      console.log(JSON.stringify(summary, null, 2));
      if (slip.isSwap && slip.aboveDefaultCap) {
        console.log(`  ⚠ HIGH slippage: ${slip.tolerancePct} consciously accepted (above the ${slip.defaultCapPct} default cap) — worst case ${c.minAmountOut} ${c.destToken}`);
      }
      console.log("\nROUTES CONSIDERED (ranked by net amountOut):");
      for (const q of r.ranked)
        console.log(`  ${q.provider.padEnd(10)} out=${q.amountOut} ${q.destToken}  fee=${q.bridgeFeeBps.toFixed(1)}bps  eta=${q.etaSeconds}s`);
      if (r.note) console.log(`\n${r.note}`);
      if (r.result) console.log("\nEXECUTION:", JSON.stringify(r.result, null, 2));
    })
    .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
