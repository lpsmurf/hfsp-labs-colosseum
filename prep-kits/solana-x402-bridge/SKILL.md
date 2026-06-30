---
name: solana-x402-bridge
description: Cross-chain execution for Solana agents. Use when a Solana agent needs to move USDC to an EVM chain (Polygon, Gnosis, Base, Arbitrum) and act on it — including reading and betting on Polymarket. Routes through the HFSP x402 relayer with transparent fees and safety guardrails. Triggers include "bridge USDC", "send to Polygon/EVM", "bet on Polymarket", "cross-chain", "reach EVM market from Solana".
---

# solana-x402-bridge

Router skill for cross-chain execution from Solana to EVM. Load the relevant module:

1. **Quoting a bridge?** → `skills/bridge-quote` — always quote first; surfaces the disclosed fee.
2. **Executing a bridge?** → `skills/bridge-execute` — only after a quote + safety check.
3. **Safety / preflight?** → `skills/bridge-safety` — ALWAYS run before execute. Allowlist, caps, slippage, RPC freshness.
4. **Which chains/tokens?** → `skills/evm-targets`.
5. **Reading Polymarket?** → `skills/polymarket-read`.
6. **Placing a Polymarket bet?** → `skills/polymarket-bet` — bridge to Polygon first.

## Golden rules
- Solana is the front door: every flow originates from a Solana wallet.
- Never `bridge-execute` without a passing `bridge-safety` preflight.
- Never act on a stale RPC read — `bridge-safety` enforces the freshness guard.
- The fee is charged by the relayer (x402) and is always shown in `bridge-quote`. Never hide it.
