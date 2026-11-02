---
name: bridge-execute
description: Execute a bridge from Solana to an EVM chain after a quote and safety preflight. The current scaffold routes to the winning provider adapter directly or prefers the HFSP x402 relayer when configured. Use for "do the bridge", "send the USDC", "execute bridge to Polygon".
---

# bridge-execute

Performs the bridge. Only after `bridge-quote` AND a passing `bridge-safety` preflight.

## Flow
1. Re-confirm quote is fresh.
2. Pick the best eligible external provider returned by the aggregator, or the HFSP relayer route when preferred.
3. Execute through that provider adapter or relayer and return its settlement handles.
4. Return `{ sourceTx, destTx, statusId }` with explorer links.

## Rules
- Never execute without a passing safety preflight (allowlist, caps, freshness).
- Return whatever settlement handles the route provides. The HFSP relayer polls its own status until settled; external adapters return directly from `execute`, so their `statusId` must be checked separately (e.g. via the provider's `status()`).
- The HFSP relayer route is separate from the judge-facing external comparison and is controlled by `PREFER_HFSP_RELAYER`.
- Run `scripts/bridge-execute.ts`.
