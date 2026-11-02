---
name: position-manager
description: Manage Solana CLMM/LP positions with the piece every other position manager is missing — the CAPITAL layer. Fund a position from ANY chain or fiat (card/bank), track impermanent loss and out-of-range, get an expected-value rebalance verdict, and exit cross-chain or to a bank. Reuses this skill's proven, safety-gated bridge aggregator + Onramper. Use for "fund my LP", "rebalance my position", "am I out of range", "impermanent loss", "cash out my position", "bring USDC to Solana for a position".
---

# position-manager

Most position managers analyze positions you **already funded on Solana**. This one closes the
full capital loop — **fund → manage → execute → exit** — across chains and fiat, with real,
safety-gated execution (not just suggestions).

> **Status:** cross-chain funding/exit via the **bridge is LIVE and proven on mainnet**. The
> **fiat** funding/exit paths (`fund-fiat` / `exit-fiat`) run against **Onramper's sandbox** today
> (production fiat coming soon). Position analysis (`analyze`) is fully working and read-only.

## Why it's different
| Capability | Typical position manager | This one |
|---|---|---|
| Track IL / out-of-range / rebalance EV | ✅ | ✅ |
| **Fund a position from another chain** | ❌ | ✅ `fund-bridge` (bridge aggregator) |
| **Fund a position from fiat (card/bank)** | ❌ | ✅ `fund-fiat` (Onramper) |
| **Exit to another chain / to a bank** | ❌ | ✅ `exit-bridge` / `exit-fiat` |
| **Real, safety-gated execution** (preflight + slippage + re-quote + confirm) | advisory only | ✅ |
| **Proven on mainnet** | tests/sims | ✅ real round-trip tx hashes |

## Commands (`scripts/position.ts`)
- `analyze <entry> <current> <lower> <upper> <valueUsd> <feeAprPct> <days>` — IL vs HODL, out-of-range, edge proximity, and an EV rebalance verdict (`hold` / `rebalance` / `exit`). Self-contained math (`clmm-engine.ts`).
- `fund-fiat <fiat> <amount>` — best ranked fiat→USDC quote delivered on Solana (Onramper).
- `exit-fiat <amountUSDC> <fiat>` — best ranked USDC→fiat cash-out.
- `fund-bridge <amountUSDC> <fromChain>` — bring USDC to Solana from another chain (uses the proven return bridge).
- `exit-bridge <amountUSDC> <toChain>` — move USDC out via the best-rate aggregator route.

## How it composes the rest of the skill
- **Funding/exit** routes through `bridge-aggregator` / `bridge-execute` / `bridge-return` (best-rate, multi-provider) and `fiat-onramp` (Onramper).
- **Safety**: every execution goes through `bridge-safety` (allowlist, caps, slippage protection, re-quote) and `rpc-health` (no stale-RPC reads). Nothing signs without `--confirm`.

## Rules
- Advisory analysis is read-only; capital moves are non-custodial and require explicit `--confirm`.
- Every fee (bridge, Onramper, gas) is disclosed; rebalance verdicts net fees against IL + gas + slippage.
- Solana is the home base — positions live on Solana; capital is sourced to and from it.
