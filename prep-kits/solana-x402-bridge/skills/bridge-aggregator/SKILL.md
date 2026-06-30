---
name: bridge-aggregator
description: Aggregate multiple cross-chain bridge providers (Circle CCTP, Mayan, deBridge, Wormhole, Allbridge, LI.FI, HFSP x402) and return the best route for a Solana to EVM transfer — same-asset bridge (USDC->USDC) or cross-chain swap (e.g. SOL->ETH), ranked by amount-out net of all fees and gas. The "Jupiter of cross-chain". Use for "best bridge rate", "cheapest way to bridge", "compare bridges", "aggregate bridge quote".
---

# bridge-aggregator

Quote every supported provider in parallel; return the best net route + the full comparison.

## How it ranks
1. Query all `BridgeProvider` adapters (`scripts/providers.ts`) for (amount, destChain, destToken).
2. Normalize each quote to `amountOutUSDC` after provider fee + gas.
3. Filter: drop providers above `maxEtaSeconds` or below the reliability floor.
4. Add the transparent HFSP integrator fee on top (INTEGRATOR_FEE_BPS).
5. Rank by net amountOut; tie-break on speed. Return winner + ranked list.

## Rules
- USDC default benchmark = **Circle CCTP** (native 1:1, no slippage) — always include it.
- ALWAYS return the per-provider comparison, not just the winner — proving best-rate selection is the product.
- Adding a provider = one new adapter file implementing the `BridgeProvider` interface.

Run `scripts/bridge-quote.ts` (aggregates) — it calls the aggregator internally.
