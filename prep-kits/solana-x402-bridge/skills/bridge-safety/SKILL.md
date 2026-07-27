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

## Swap slippage (any-token transfers, e.g. SOL->ETH)
For `kind: "swap"` quotes (different destToken), additionally:
- Reject if `amountOut < minAmountOut` (slippage tolerance, DEFAULT_SLIPPAGE_BPS).
- Re-quote right before execute; abort if price drifted beyond tolerance.
Same-asset bridges (USDC->USDC) have priceImpactBps=0 and skip this.

## RPC health switcher (both chains)
Backed by `scripts/rpc-health.ts`:
- **Solana source:** probes `getSlot` across SOLANA_RPC_URL + SOLANA_FALLBACK_RPCS, picks lowest slot-lag healthy endpoint, fails if all > RPC_MAX_SLOT_LAG behind.
- **EVM destination:** probes `eth_blockNumber` across <CHAIN>_RPC_URL + <CHAIN>_FALLBACK_RPCS, picks freshest/lowest-latency, fails if all > EVM_MAX_BLOCK_LAG behind.
A failing/lagging RPC on either side blocks execution — agents on a single RPC are fragile; this auto-swaps endpoints before acting.
