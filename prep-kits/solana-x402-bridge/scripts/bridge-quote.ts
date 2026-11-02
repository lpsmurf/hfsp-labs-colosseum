// usage: tsx scripts/bridge-quote.ts <srcToken> <amountIn> <destChain> <destToken>
//   bridge: tsx scripts/bridge-quote.ts USDC 5 polygon USDC
//   swap:   tsx scripts/bridge-quote.ts SOL 1 ethereum ETH
import "./env.js";
import { aggregate } from "./bridge-aggregator.js";
import { describeSwapSlippage } from "./bridge-safety.js";
import type { ProviderQuote } from "./providers.js";
import type { EvmChain } from "./types.js";

// "Should you pay for aggregation?" — honest free-vs-paid verdict.
// FREE tier = CCTP (USDC same-asset). PAID tier = full multi-provider aggregation + swaps.
// Only pay when the best paid route beats free CCTP by more than the integrator fee.
function paidValueVerdict(ranked: ProviderQuote[], best: ProviderQuote, srcToken: string, amountIn: number): string | null {
  if (best.kind === "swap") {
    return "Free tier (CCTP) can't do swaps — cross-chain swaps are the paid capability (no free fallback).";
  }
  if (srcToken.toLowerCase() !== "usdc") return null;
  const free = ranked.find((q) => q.provider === "cctp");
  if (!free) return null;
  const f = (n: number) => n.toFixed(6);
  if (best.provider === "cctp") {
    return `Free CCTP is already the best route (${f(free.amountOut)} USDC) — no need to pay for aggregation.`;
  }
  const floor = Number(process.env.QUOTE_FEE_FLOOR_USDC ?? 0.02);
  const bps = Number(process.env.INTEGRATOR_FEE_BPS ?? 15);
  const fee = floor + (amountIn * bps) / 10000;
  const savings = best.amountOut - free.amountOut;
  const net = savings - fee;
  const verdict = net > 0 ? `net +${f(net)} USDC → worth paying` : `net ${f(net)} USDC → use FREE CCTP`;
  return `Free CCTP: ${f(free.amountOut)} | Best paid (${best.provider}): ${f(best.amountOut)} | saves ${f(savings)} − fee ~${f(fee)} → ${verdict}`;
}

const [srcToken, amountIn, destChain, destToken] = process.argv.slice(2);
aggregate(srcToken, Number(amountIn), destChain as EvmChain, destToken).then(({ best, ranked }) => {
  if (!best) { console.log("No eligible route for this pair."); return; }
  console.log(`BEST (${best.kind}):`, JSON.stringify(best, null, 2));
  if (best.kind === "swap") {
    const s = describeSwapSlippage(best);
    const flag = s.aboveDefaultCap
      ? ` ⚠ above ${s.defaultCapPct} default cap — needs --accept-slippage=${s.bps} to execute`
      : " (within default cap)";
    console.log(`  slippage tolerance: ${s.tolerancePct} (${s.bps} bps); min received ${best.minAmountOut} ${best.destToken}${flag}`);
  }
  console.log("\nCOMPARISON (ranked, net of fees + impact):");
  for (const q of ranked)
    console.log(`  ${q.provider.padEnd(10)} out=${q.amountOut} ${q.destToken} impact=${q.priceImpactBps}bps eta=${q.etaSeconds}s`);

  const verdict = paidValueVerdict(ranked, best, srcToken, Number(amountIn));
  if (verdict) console.log(`\nFREE vs PAID: ${verdict}`);
});
