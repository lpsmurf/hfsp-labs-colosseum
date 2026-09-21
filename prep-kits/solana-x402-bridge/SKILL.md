---
name: solana-x402-bridge
description: The Jupiter of cross-chain for Solana agents. Use when a Solana agent needs the best-rate bridge of USDC to an EVM chain (Polygon, Gnosis, Base, Arbitrum), wants to be funded with fiat, or needs to read/bet on Polymarket. Aggregates multiple bridge providers (CCTP, Mayan, deBridge, Wormhole, Allbridge, LI.FI, x402) and Onramper for fiat. Triggers: "best bridge rate", "bridge USDC", "compare bridges", "fund with fiat", "onramp", "bet on Polymarket", "cross-chain".
---

# solana-x402-bridge

Router skill for best-rate cross-chain execution from Solana to EVM. Load the relevant module:

1. **Want the best route / compare bridges?** → `skills/bridge-aggregator` (quotes all providers).
2. **Quoting a transfer?** → `skills/bridge-quote` — returns aggregated best + comparison. Quote first.
3. **Executing?** → `skills/bridge-execute` — only after a quote + safety check; routes to the winning provider.
4. **Safety / preflight?** → `skills/bridge-safety` — ALWAYS before execute. Allowlist, caps, slippage, RPC freshness.
5. **Which chains/tokens/providers?** → `skills/evm-targets`.
6. **Fund with fiat / cash out?** → `skills/fiat-onramp` (Onramper).
7. **Reading Polymarket?** → `skills/polymarket-read`.
8. **Placing a Polymarket bet?** → `skills/polymarket-bet` — bridge to Polygon first.

## Golden rules
- Solana is the front door: every flow originates from a Solana wallet.
- Always aggregate — return the per-provider comparison, never a single hardcoded route.
- Never `bridge-execute` without a passing `bridge-safety` preflight.
- Never act on a stale RPC read — `bridge-safety` enforces the freshness guard.
- Every fee (bridge providers, integrator, Onramper) is quoted and disclosed. Never hidden.
