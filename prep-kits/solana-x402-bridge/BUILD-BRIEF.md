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
