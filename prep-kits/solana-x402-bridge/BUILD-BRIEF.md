# BUILD BRIEF — `solana-x402-bridge` Agent Skill + Relayer

**Audience:** Devin (build agent). This is your complete spec. Build from it directly.
**Goal:** Ship a Solana AI Kit skill package that lets a Solana agent bridge USDC to any EVM chain via the HFSP x402 relayer, then act on it — with a Polymarket betting flow as the flagship demo.
**Deadline context:** Bounty submission window is tight (~24h sprint). Prioritize the MVP path. Ship working > complete.

---

## 0. Why this wins (do not lose this framing)

- The Superteam Brasil bounty (`solanabr/skill-bounty`, `solanabr/solana-ai-kit`) has ~158 submissions. Almost all are tx-debuggers, security audits, token launchers — heavily saturated.
- **There is NO real cross-chain asset-bridge skill in the entire field.** The one PR named `solana-bridge-skill` (#61) is a mislabeled frontend-codegen skill. Foundation's `eth-to-sol` is code porting, not asset bridging.
- **There is NO Polymarket / betting-execution skill anywhere.** The only prediction-market PR (#44) is on-chain settlement safety, not reading/placing bets.
- We already built the hard part: `packages/gnosis-card-x402` bridges Solana/Base USDC → Gnosis Chain via x402. This skill **generalizes that to any EVM** and adds a betting demo.

**Winning combination = genuine white space + already-built core + cross-chain "wow" demo.**

**Bounty-fit guardrail:** This is a *Solana* AI Kit bounty. The Solana side is ALWAYS the front door — a Solana agent / Solana wallet initiates everything. Polymarket (Polygon) is reached *through* the bridge. Lead every README/demo with the Solana origin so judges never question relevance.

---

## 1. What already exists (reuse, do not rebuild)

| Asset | Path | What it gives you |
|---|---|---|
| x402 bridge service | `packages/gnosis-card-x402` | `/quote` + execute endpoints, x402 payment header handling, Solana+Base USDC intake, ~90s settlement to Gnosis |
| Bridge config | `packages/gnosis-card-x402/src/config.ts` | chain configs, token addresses, payment wallets |
| Solana swap module | `packages/wdk-solana-swap` | Jupiter swap pattern, slippage/fee guard, agent-friendly (no UI) |
| EVM contracts | `packages/gnosis-card-contracts` | Solidity routing scaffold (Hardhat + OZ) |

**Your job:** wrap + generalize these behind a clean skill interface, add multi-EVM target registry, add the integrator-fee layer, add the Polymarket demo layer.

---

## 2. Architecture

```
Solana Agent (Claude Code + this skill)
        │  reads SKILL.md, calls scripts/
        ▼
 scripts/*.ts  (thin open-source client — NO secrets, NO hardcoded fee skim)
        │  HTTPS + x402 payment
        ▼
 HFSP x402 Relayer  (hosted; generalized from gnosis-card-x402)
   ├─ /quote        → route + fees + ETA (fee disclosed here)
   ├─ /execute      → performs bridge, returns dest tx
   ├─ /targets      → supported EVM chains + tokens
   └─ /status/:id   → settlement status
        │
        ▼
 Destination EVM chain (Polygon for Polymarket, Gnosis, Base, Arbitrum, ...)
        │
        ▼
 Polymarket (demo layer) — read markets, place bet, redeem
```

**Fee lives in the RELAYER, not the skill.** The skill is MIT/open — a hardcoded skim is strippable in 3 lines and looks bad to judges. The relayer's x402 price IS the fee. See §5.

---

## 3. Modules to build

### Core (MVP — must ship)
1. **`bridge-quote`** — given (amountUSDC, destChain, destToken), return route, **disclosed fee breakdown**, network fees, amountOut, ETA. Pure read. → `scripts/bridge-quote.ts`
2. **`bridge-execute`** — pay via x402, trigger relayer, return source+dest tx + status handle. → `scripts/bridge-execute.ts`
3. **`bridge-safety`** — preflight gate: destination allowlist, per-tx + daily spend caps, slippage/min-amountOut check, and **freshness guard** (reject if source RPC slot-lag > threshold — never act on stale balance). Confirmation monitor on both chains. → `scripts/bridge-safety.ts` + `scripts/rpc-health.ts`
4. **`evm-targets`** — registry of supported EVM chains + token addresses + relayer endpoints. → `scripts/evm-targets.ts`

### Demo layer (flagship — ship if MVP done; this is the "wow")
5. **`polymarket-read`** — list/search markets, current odds, user positions. → `scripts/polymarket.ts`
6. **`polymarket-bet`** — place a bet (USDC.e on Polygon), redeem winnings. Reuse partial code we already have. → `scripts/polymarket.ts`

Each module = a folder with `SKILL.md` (frontmatter `name` + `description`) + reference to its script.

---

## 4. Requirements / prerequisites

- Node 20+, TypeScript, tsx.
- `@solana/web3.js` (Solana side), `viem` or `ethers` (EVM side).
- Helius (or equivalent) Solana RPC — env var, never committed.
- One EVM RPC per supported chain (Polygon mandatory for Polymarket).
- Relayer base URL as env var (`X402_RELAYER_URL`), default to HFSP hosted.
- Polymarket: CLOB API + USDC.e on Polygon. Use Polymarket's CLOB client.
- Testnet/small-amount mode for the demo (money movement = judge scrutiny; demo safely).

---

## 5. Fee model (the monetization — keep it honest)

- **Where:** charged by the relayer via x402. The bridge call's x402 price is the fee. Forking the open skill does NOT remove it.
- **Rate:** small + dual-structured so it's attractive at all sizes:
  - tiny flat floor (a few cents) so micro-bridges are worth relaying, **plus**
  - **5–25 bps** (0.05–0.25%) on amount. Stay ≤25 bps — reads as "cheap" vs typical 0–0.3%.
- **Configurable:** expose `integratorFeeBps` + `feeAccount` (Jupiter referral pattern), defaulting to HFSP wallet. Partners/forkers can set their own → invites integration instead of fee-stripping.
- **Transparency is mandatory:** `bridge-quote` MUST return the full fee breakdown (see example in `skills/bridge-quote/SKILL.md`). Hidden fees = bad UX + bad optics.
- **Optics:** the skill's pitch is the CAPABILITY (Solana agents reach EVM markets). The fee is a quiet, disclosed line — never the story.

---

## 6. Acceptance criteria (definition of done)

MVP:
- [ ] `bridge-quote.ts <amount> <chain> <token>` returns a correct quote with disclosed fee breakdown.
- [ ] `bridge-execute.ts` completes a small real USDC bridge Solana → Polygon and returns both tx hashes.
- [ ] `bridge-safety` blocks: a destination not on the allowlist, an over-cap amount, and a stale-RPC read.
- [ ] `evm-targets` lists ≥3 EVM chains incl. Polygon.
- [ ] Every module has a `SKILL.md` with valid frontmatter; top-level `SKILL.md` routes between them.
- [ ] README runs the 60s demo with only env vars (no code edits).
- [ ] MIT LICENSE present.

Flagship:
- [ ] `polymarket-read` lists live markets + odds.
- [ ] `polymarket-bet` places a small bet on Polygon and can redeem.
- [ ] End-to-end demo: Solana wallet → bridge → bet on a real Polymarket market, all from the agent.

---

## 7. Demo script (60 seconds — see examples/demo/cross-chain-bet.md)

1. Agent: "Bet 5 USDC that <event> resolves YES on Polymarket."
2. `bridge-quote` → shows route Solana→Polygon, fee `0.0075 USDC (15 bps)`, ETA 45s.
3. `bridge-safety` preflight passes (within caps, RPC fresh, dest allowlisted).
4. `bridge-execute` → USDC lands on Polygon (~45–90s). Show both explorer links.
5. `polymarket-bet` → bet placed. Show position.
6. Narrate: "Initiated from a Solana wallet. One skill. Cross-chain."

---

## 8. Submission

- Package the skill (this folder's `skills/` + `scripts/` + `README` + `LICENSE`) as a standalone repo `solana-x402-bridge-skill`.
- Submit PR to `solanabr/skill-bounty` (and optionally as a submodule to `solanabr/solana-ai-kit`).
- PR description: 3 lines — (1) the gap it fills (no real bridge skill exists), (2) the 60s demo command, (3) "Solana front door" relevance note.

---

## 9. Build order for the 24h sprint

1. `evm-targets` + `bridge-quote` (read-only, fast, proves the interface). 
2. `bridge-safety` + `rpc-health` (guardrails — judges reward these on money movement).
3. `bridge-execute` (wire to generalized relayer; reuse gnosis-card-x402).
4. Relayer: generalize `gnosis-card-x402` to multi-EVM + add fee param.
5. `polymarket-read` then `polymarket-bet` (flagship demo).
6. README + demo recording.

Stop after step 3 = a valid, winning bridge submission. Steps 4–6 make it spectacular.

---

## 10. UPDATE — Bridge AGGREGATION + Onramper fiat layer

This reframes the product from "a bridge" to **"the Jupiter of cross-chain for agents"**: aggregate multiple bridge providers, quote them all, return the best net rate. Plus an optional **Onramper** fiat layer so an agent can be funded by card/bank and cash out winnings.

### 10.1 Two aggregation layers

```
 FIAT (card / bank, 130+ methods)
        │  Onramper (aggregates 20+ onramp providers, ranked)
        ▼
 USDC on Solana  ─┐
                  │  BRIDGE AGGREGATOR (this skill) — quote N providers, pick best net-of-fee
                  ▼
 USDC on any EVM chain  →  execute (e.g. Polymarket bet)
        │
        ▼ (optional cash-out)
 Onramper OFFRAMP → fiat
```

### 10.2 Bridge route aggregator (CORE — the new headline)

New module **`bridge-aggregator`**: query every supported provider in parallel, normalize quotes, rank by **amountOut net of all fees + gas**, subject to ETA + reliability, then add our transparent integrator fee on top. `bridge-quote` now returns the **best** route plus the full per-provider comparison (so the agent — and judges — see we actually shopped the rate).

**Providers to integrate (Solana → EVM capable):**
| Provider | Why | Notes |
|---|---|---|
| **Circle CCTP** | Native 1:1 USDC burn/mint, lowest cost, no slippage | Best for USDC specifically; supports Solana + major EVM. Make it the default benchmark. |
| **Mayan Finance** | Solana-native cross-chain (Wormhole + Swift/MCTP) | Strong Solana↔EVM coverage |
| **deBridge (DLN)** | Fast intent-based Solana↔EVM | |
| **Wormhole / Portal** | Canonical token bridge | fallback / wrapped |
| **Allbridge** | Stablecoin Solana↔EVM | |
| **LI.FI** | EVM(+Solana) bridge+DEX aggregator | can act as a meta-provider; useful as a sanity benchmark |
| **HFSP x402 relayer** | our own route (gnosis-card-x402 generalized) | always quote it too; it carries our fee natively |

**Adapter pattern:** each provider implements a common `BridgeProvider` interface (`quote()`, `execute()`, `status()`). The aggregator iterates adapters. Adding a provider = adding one adapter file. See `scripts/providers.ts`.

**Ranking:** maximize `amountOutUSDC` after provider fee + gas + our integrator fee; filter out providers above `maxEtaSeconds` or below a reliability floor; tie-break on speed. Always return the ranked list, not just the winner.

### 10.3 Onramper fiat layer (BONUS — funnel extension)

New module **`fiat-onramp`** wrapping Onramper (API key + signed requests; widget or pure API):
- **Onramp:** fiat → USDC delivered on Solana (or directly on the destination EVM chain). Onramper already ranks 20+ providers — we surface its best quote alongside our bridge quote so the agent can choose "fund + bridge" or "fund directly on destination."
- **Offramp:** USDC → fiat for cashing out winnings.
- **Quote-first, always disclosed.** Onramper provider fees shown transparently, same rule as bridge fees.

Onramper supports onramp, offramp, and crypto swaps via a unified API with provider ranking/recommendations. Treat it as the fiat aggregator analog to our bridge aggregator.

### 10.4 Updated module list
Core: `bridge-aggregator` (NEW headline), `bridge-quote` (now returns aggregated best + comparison), `bridge-execute` (routes to the chosen provider's adapter), `bridge-safety`, `evm-targets` (now also provider registry).
Funnel: `fiat-onramp` (NEW — Onramper).
Demo: `polymarket-read`, `polymarket-bet`.

### 10.5 Updated build order (24h)
1. `evm-targets` + provider registry/adapters skeleton (`scripts/providers.ts`).
2. **CCTP adapter + Mayan adapter + our x402 route** → `bridge-aggregator` ranking → `bridge-quote` returns best + comparison. (3 providers is enough to prove aggregation.)
3. `bridge-safety` + `rpc-health`.
4. `bridge-execute` routing to chosen adapter.
5. `fiat-onramp` (Onramper) — onramp quote first, offramp if time.
6. `polymarket-read` → `polymarket-bet` (flagship demo).

**MVP to win = steps 1–4 with ≥3 providers aggregated.** That alone is novel (no aggregator bridge skill exists). Onramper + Polymarket make it a complete fiat→bet funnel.

### 10.6 Positioning update
"The Jupiter of cross-chain for Solana agents — aggregate every bridge, quote the best rate, optionally fund with fiat, and execute on EVM." Lead with aggregation; it's the differentiator and the judge-legible value (you can *prove* best-rate selection on screen).

---

## 11. UPDATE — Any-token transfers (bridge AND cross-chain swap)

The skill now handles two transfer kinds:
- **bridge** — same asset, e.g. USDC→USDC. 1:1, no slippage.
- **swap** — different destination token, e.g. **SOL→ETH**. Has slippage + price impact (swap legs on both chains).

### 11.1 Provider capability matrix
| Provider | USDC→USDC bridge | Any-token swap (SOL→ETH) |
|---|---|---|
| CCTP | ✅ native 1:1 | ❌ USDC only |
| Mayan | ✅ | ✅ core feature (any→any) |
| deBridge DLN | ✅ | ✅ (intent: sell SOL → receive ETH) |
| Wormhole | ✅ (CCTP/token bridge) | ⚠️ needs swap legs — treated as same-asset only here |
| Allbridge | ✅ stables | ❌ stable pools only |

`supportsPair(srcToken, chain, destToken)` on each adapter decides eligibility. For SOL→ETH the aggregator's eligible set automatically becomes **Mayan + deBridge**.

### 11.2 What changes in code
- Interface is now `(srcToken, amountIn, destChain, destToken)` everywhere (see `types.ts`, `providers.ts`).
- `BridgeQuote` adds `kind`, `srcToken`, `destToken`, `priceImpactBps`, `slippageBps`, `minAmountOut`.
- Ranking still = best net `amountOut` (in destToken).

### 11.3 Safety (CRITICAL for swaps)
Volatile pairs make slippage a loss vector. `bridge-safety` MUST:
- Enforce `slippageBps` tolerance and reject if quoted `amountOut < minAmountOut`.
- Re-quote immediately before execute (prices move); abort if drift > tolerance.
- Keep the stale-RPC freshness guard (never act on lagging price/balance).
USDC bridges set `priceImpactBps = 0` and skip slippage logic.

### 11.4 Demo vs capability (do not blur)
- **Primary demo stays USDC → Polymarket** — stable, deterministic, no slippage surprises in a 24h window.
- **SOL→ETH is a showcased second capability** ("the aggregator also does cross-chain swaps"), demoed with a tiny amount on testnet/small size. Do not make a volatile swap the headline demo.

### 11.5 Build-order impact
No new step — the same adapters (Mayan, deBridge) deliver both bridge and swap. Implement USDC bridge first (proves aggregation cleanly), then enable any-token quoting on Mayan/deBridge (mostly the same API with different in/out tokens).
