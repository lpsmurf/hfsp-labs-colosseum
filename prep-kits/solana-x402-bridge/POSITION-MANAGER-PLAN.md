# Position Manager × solana-x402-bridge — Integration Plan

## Context
- **`solanabr/position-manager-skill`** — *"CLMM position manager for Orca Whirlpools / Raydium CLMM / Meteora DLMM — track impermanent loss, alert on out-of-range, suggest rebalances."* Same Superteam Brasil / Solana AI Kit bounty as ours. **Currently a stub** (LICENSE only, MIT © Superteam Brazil, 1 commit, 6 open PRs, 9 forks) — there is no code/interface to integrate against yet.
- **Ours (`solana-x402-bridge`)** — best-rate cross-chain bridge aggregator (CCTP/Mayan/deBridge/Allbridge) + safety preflight + slippage protection + Onramper fiat + `rpc-health`, with **real on-chain execution proven** (Solana↔Polygon round trip).

## Thesis
**Bridge = the capital/liquidity layer; Position Manager = the deployment/management layer.**
A position manager constantly needs to *move capital* (fund new positions, rebalance out-of-range positions, exit to fiat) and *monitor reliably*. That is exactly what we already provide.

## Integration surface (what we expose to a position manager)
| Function | Built on | Status |
|---|---|---|
| `fundPosition(amountUSDC, fromChain)` → bridge USDC to Solana, return delivered amount + tx | `auto-bridge` | reuse (low effort) |
| `exitToFiat(amountUSDC, fiat)` → offramp proceeds | `fiat-onramp` (Onramper) | reuse (low effort) |
| `rebalanceCrossChain(position, targetChain)` → move liquidity where it's needed | `bridge-execute` / `bridge-return` | medium |
| reliable monitoring RPC for the out-of-range polling loop | `rpc-health` | drop-in |

## Shared contract (the thing to standardize)
A minimal `FundingProvider` interface the position manager can depend on:
```ts
interface FundingProvider {
  quoteFunding(amountUSDC: number, fromChain: string): Promise<{ amountOut: number; feeUSDC: number; etaSeconds: number }>;
  fund(amountUSDC: number, fromChain: string, recipient: string): Promise<{ sourceTx: string; delivered: number }>;
  offramp(amountUSDC: number, fiat: string): Promise<{ best: { provider: string; payout: number; feePct: number } }>;
}
```
The position manager calls `FundingProvider`; our skill implements it. Clean separation, both stay independently useful.

## Build options
- **(A) Contribute to their repo** — PR adding a bridge-funding hook. But it's an empty stub with 6 competing PRs, so we'd be defining most of it and racing others.
- **(B) Build our own thin position layer** that composes our bridge + one DEX SDK, where the bridge is native. Strongest differentiation; "the bridge that funds & rebalances your positions."
- **(C) Hybrid (recommended)** — implement `FundingProvider` + a reference **Orca Whirlpools** read adapter on *our* side, and offer it to the position-manager bounty as the funding dependency. We win on our bridge AND plug into theirs.

## Phased plan
- **Phase 0 (now):** this plan + the `FundingProvider` interface.
- **Phase 1 (low effort, high value):** `fundPosition` + `exitToFiat` — pure composition of `auto-bridge` + `fiat-onramp`. Demoable immediately.
- **Phase 2:** position **read** for Orca Whirlpools via `@orca-so/whirlpools-sdk` — list positions, detect out-of-range, compute IL. (Read-only, no funds.)
- **Phase 3:** out-of-range alert → `rebalanceCrossChain` trigger.

## Scope risk (be honest)
Full CLMM lifecycle (open/close/tick math/position NFTs across 3 DEXes) is heavy — **lead with funding + read**, not the full position lifecycle, for a hackathon window.
