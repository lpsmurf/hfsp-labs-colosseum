---
name: bridge-execute
description: Execute a USDC bridge from Solana to an EVM chain via the x402 relayer, after a quote and safety preflight. Returns source and destination transaction hashes and a status handle. Use for "do the bridge", "send the USDC", "execute bridge to Polygon".
---

# bridge-execute

Performs the bridge. Only after `bridge-quote` AND a passing `bridge-safety` preflight.

## Flow
1. Re-confirm quote is fresh.
2. Pay the relayer via x402 (USDC on Solana) — payment header carries the source tx.
3. Relayer settles native USDC on the destination chain (~45–90s).
4. Return `{ sourceTx, destTx, statusId }` with explorer links.

## Rules
- Never execute without a passing safety preflight (allowlist, caps, freshness).
- Poll `/status/:id` on the relayer until settled; surface both chain confirmations.
- Reuse the proven flow in `packages/gnosis-card-x402`.
- Run `scripts/bridge-execute.ts`.
