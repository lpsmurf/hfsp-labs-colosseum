---
name: bridge-safety
description: Mandatory preflight before any bridge execution. Enforces destination allowlist, per-transaction and daily spend caps, slippage / minimum amount-out, and a stale-RPC freshness guard that refuses to act on lagging chain state. Use whenever a bridge or cross-chain transfer is about to execute.
---

# bridge-safety

The guard that makes moving funds safe. ALWAYS run before `bridge-execute`.

## Checks (fail loud — never silently proceed)
1. **Destination allowlist** — destChain ∈ DEST_ALLOWLIST.
2. **Spend caps** — amount ≤ MAX_BRIDGE_USDC_PER_TX and rolling 24h ≤ MAX_BRIDGE_USDC_PER_DAY.
3. **Slippage / min-out** — amountOut ≥ user minimum.
4. **Freshness guard** — source RPC slot-lag ≤ RPC_MAX_SLOT_LAG; otherwise fail over (scripts/rpc-health.ts) or abort. A lagging RPC = stale balance = do NOT bridge.
5. **Confirmation monitor** — after execute, confirm on both source and dest chains.

## Why the freshness guard matters
Bridging on a stale balance read can double-spend or strand funds. Treat a stale slot as "do not act."

Run `scripts/bridge-safety.ts` (uses `scripts/rpc-health.ts`).
