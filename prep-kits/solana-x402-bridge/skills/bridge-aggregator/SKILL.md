---
name: bridge-aggregator
description: Aggregate multiple cross-chain bridge providers (Circle CCTP, Mayan, deBridge, Wormhole, Allbridge) and return the best external route for a Solana to EVM transfer — same-asset bridge (USDC->USDC) or cross-chain swap (e.g. SOL->ETH), ranked by amount-out net of all fees and gas. The HFSP x402 relayer route is surfaced separately. Use for "best bridge rate", "cheapest way to bridge", "compare bridges", "aggregate bridge quote".
---

# bridge-aggregator

Quote every supported external provider in parallel; return the best net route + the full comparison, and surface the HFSP relayer separately when configured.

## How it ranks
1. Query all `BridgeProvider` adapters (`scripts/providers.ts`) for (amount, destChain, destToken).
2. Normalize each quote to net destination-token output after provider fee + gas.
3. Filter: drop providers above `maxEtaSeconds` or below the reliability floor.
4. If `INTEGRATOR_FEE_BPS` is set, apply it consistently before ranking.
5. Rank by net amountOut; tie-break on speed. Return winner + ranked list.
6. If `X402_RELAYER_URL` is set, fetch the HFSP relayer quote separately so execution can prefer it without polluting the external comparison table.

## Rules
- USDC default benchmark = **Circle CCTP** (native 1:1, no slippage) — always include it.
- ALWAYS return the per-provider comparison, not just the winner — proving best-rate selection is the product.
- Keep the HFSP relayer route separate from the external ranking to avoid self-dealing optics in the demo.
- Adding a provider = one new adapter file implementing the `BridgeProvider` interface.

Run `scripts/bridge-quote.ts` (aggregates) — it calls the aggregator internally.
