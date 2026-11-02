// Mandatory preflight. Fail loud; never silently proceed.
// Checks BOTH chains' RPC health (source Solana + destination EVM) before any execution,
// and — for cross-chain SWAPS (srcToken != destToken) — enforces slippage protection.
import { getHealthySolana, getHealthyEvmRpc } from "./rpc-health.js";
import { aggregate } from "./bridge-aggregator.js";
import type { SafetyResult } from "./types.js";
import type { ProviderQuote } from "./providers.js";

const MAX_SLIPPAGE_BPS = Number(process.env.MAX_SLIPPAGE_BPS ?? 300);            // default comfortable cap (3%)
const ABSOLUTE_MAX_SLIPPAGE_BPS = Number(process.env.ABSOLUTE_MAX_SLIPPAGE_BPS ?? 1000); // hard rail (10%) — not even consent can exceed

export interface SlippageOpts {
  // The agent's EXPLICIT, conscious acceptance of higher slippage for this call (in bps).
  // Raises the cap above MAX_SLIPPAGE_BPS, but never above ABSOLUTE_MAX_SLIPPAGE_BPS.
  acceptSlippageBps?: number;
}

// Slippage protection for swaps. Same-asset bridges (priceImpact 0) skip this entirely.
// Guards the canonical failure modes: no/zero min-out, unbounded slippage, missing floor.
// An agent may opt into "unusual" slippage via opts.acceptSlippageBps, bounded by the hard rail.
export function checkSwapSlippage(
  q: Pick<ProviderQuote, "kind" | "slippageBps" | "minAmountOut" | "amountOut">,
  opts: SlippageOpts = {},
): string[] {
  const f: string[] = [];
  if (q.kind !== "swap") return f; // bridges are 1:1, no slippage logic

  // Effective cap: default, optionally raised by explicit agent consent, never past the hard rail.
  const consented = opts.acceptSlippageBps != null && opts.acceptSlippageBps > MAX_SLIPPAGE_BPS;
  const cap = consented ? Math.min(opts.acceptSlippageBps!, ABSOLUTE_MAX_SLIPPAGE_BPS) : MAX_SLIPPAGE_BPS;

  if (!(q.slippageBps > 0)) f.push("swap requires a non-zero slippage tolerance (slippageBps)");
  if (q.slippageBps > ABSOLUTE_MAX_SLIPPAGE_BPS) {
    f.push(`slippage ${q.slippageBps}bps exceeds the absolute ceiling ${ABSOLUTE_MAX_SLIPPAGE_BPS}bps (raise ABSOLUTE_MAX_SLIPPAGE_BPS to allow)`);
  } else if (q.slippageBps > cap) {
    f.push(`slippage ${q.slippageBps}bps exceeds max ${MAX_SLIPPAGE_BPS}bps — pass acceptSlippageBps >= ${q.slippageBps} to consciously accept (up to ${ABSOLUTE_MAX_SLIPPAGE_BPS}bps)`);
  }
  if (!(q.minAmountOut > 0)) f.push("swap requires a positive minAmountOut floor (never accept 0-out)");
  if (q.minAmountOut > q.amountOut) f.push("minAmountOut above quoted amountOut (inverted floor)");
  return f;
}

// Human-readable slippage summary for output (so the tolerance/floor and any override
// are visible, not buried as raw bps). aboveDefaultCap => an override was needed/used.
export function describeSwapSlippage(q: Pick<ProviderQuote, "kind" | "slippageBps" | "minAmountOut">) {
  return {
    isSwap: q.kind === "swap",
    bps: q.slippageBps,
    tolerancePct: (q.slippageBps / 100).toFixed(2) + "%",
    minAmountOut: q.minAmountOut,
    aboveDefaultCap: q.slippageBps > MAX_SLIPPAGE_BPS,
    defaultCapPct: (MAX_SLIPPAGE_BPS / 100).toFixed(0) + "%",
  };
}

export async function preflight(
  srcToken: string,
  amountIn: number,
  chain: string,
  destToken: string,
  quote?: Pick<ProviderQuote, "kind" | "slippageBps" | "minAmountOut" | "amountOut">,
  opts: SlippageOpts = {},
): Promise<SafetyResult> {
  const failures: string[] = [];
  const allow = (process.env.DEST_ALLOWLIST ?? "").split(",").map((s) => s.trim());
  const maxTx = Number(process.env.MAX_BRIDGE_USDC_PER_TX ?? 100);

  if (!allow.includes(chain)) failures.push(`destination '${chain}' not in allowlist`);
  if (srcToken.toLowerCase() === "usdc" && amountIn > maxTx) failures.push(`amount ${amountIn} exceeds per-tx cap ${maxTx}`);

  // Swap slippage protection (only when a chosen quote is supplied and it's a swap).
  // opts.acceptSlippageBps lets the agent consciously opt into unusual slippage (bounded).
  if (quote) failures.push(...checkSwapSlippage(quote, opts));

  // Source: Solana RPC health (lowest slot-lag healthy endpoint, else fail).
  let slotLag = -1, usedRpc = "";
  try { const s = await getHealthySolana(); slotLag = s.slotLag; usedRpc = s.endpoint; }
  catch (e) { failures.push(`Solana RPC: ${(e as Error).message}`); }

  // Destination: EVM RPC health (auto-failover; fail if all stale/unreachable).
  try { await getHealthyEvmRpc(chain); }
  catch (e) { failures.push(`${chain} RPC: ${(e as Error).message}`); }

  // TODO(devin): daily-cap accounting; post-execute confirmation on both chains.
  return { ok: failures.length === 0, failures, rpcSlotLag: slotLag, usedRpc };
}

// Re-quote IMMEDIATELY before execution and re-check the floor. Prices move between
// quote-time and signing; for swaps, abort if the fresh route no longer clears the
// original minAmountOut. Returns the fresh route to execute against.
export async function requoteGuard(
  srcToken: string,
  amountIn: number,
  chain: string,
  destToken: string,
  chosen: ProviderQuote,
): Promise<{ ok: boolean; reason?: string; fresh?: ProviderQuote }> {
  const { best } = await aggregate(srcToken, amountIn, chain as any, destToken);
  if (!best) return { ok: false, reason: "re-quote returned no eligible route" };
  if (chosen.kind === "swap" && best.amountOut < chosen.minAmountOut) {
    return { ok: false, reason: `price moved beyond tolerance: fresh amountOut ${best.amountOut} < minAmountOut ${chosen.minAmountOut}` };
  }
  return { ok: true, fresh: best };
}
