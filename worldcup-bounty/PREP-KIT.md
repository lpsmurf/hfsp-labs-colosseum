# TxODDS World Cup Hackathon — Prep Kit

Three bounties, one sponsor (**TxODDS**), one stack. This kit is everything we
need to start fast: the strategy, a digested TxLine API reference, a runnable
client, and the per-bounty build specs.

| Bounty | Prize | 1st | Our fit |
|---|---|---|---|
| Prediction Markets & Settlement | 18,000 USDT | 12,000 | 🥇 strongest |
| Trading Tools & Agents | 16,000 USDT | 10,000 | 🥇 strong |
| Consumer & Fan Experiences | 16,000 USDT | 10,000 | 🥈 design-heavy |

Deadline **2026-07-29**. Track: *World Cup hackathon, exclusive to Superteam Earn*.
Contact / data access: **t.me/TxLINEChat**.

---

## Why we win: TxLine is Solana-native and we already have the engine

The decisive discovery: **TxLine (TxODDS's own feed) is a Solana on-chain-subscription
API.** Access is gated by a Solana program; scores/odds ship with **Merkle proofs
for on-chain validation**. This is squarely our wheelhouse — x402, Solana USDC,
on-chain subscriptions (the MPP/Solana-subscription pattern), and a working
Polymarket edge engine (`packages/x402-polymarket-edge`). Most teams start cold;
we start with ~70% of the core and a sponsor-perfect tech match.

**The biggest single win factor:** build on **TxLine's own data** (not our
`oddspapi` stand-in). Our fair-value provider is abstracted, so swapping is small —
see `txline-client.ts` and the provider-adapter note below.

---

## TxLine API — digested reference

Base URL: `https://txline.txodds.com` (mainnet) · devnet variant per docs.
Docs index: `https://txline-docs.txodds.com/llms.txt`.

### Auth + access flow (required even for the free World Cup tier)
1. **On-chain subscribe** via the TxLine Solana program (free WC tiers below).
2. `POST /auth/guest/start` → **guest JWT** (valid 30 days).
3. **Activate**: sign the subscription tx → long-lived **API token**.
4. Call data endpoints with **both** headers:
   `Authorization: Bearer {jwt}` and `X-Api-Token: {apiToken}`.

### Free World Cup tiers (on-chain subscription, 0-cost data)
- **Service Level 1** — World Cup & Int'l Friendlies, **60-second delay**.
- **Service Level 12** — World Cup & Int'l Friendlies, **real-time**.
- *No rate limits* on the free tier (60s delay).

### Data endpoints
| Purpose | Method | Path |
|---|---|---|
| Guest session | POST | `/auth/guest/start` |
| Purchase quote (TxL) | POST | `/api/guest/purchase/quote` |
| Activate token | POST | `/api/token/activate` |
| Fixtures snapshot | GET | `/api/fixtures/snapshot?competitionId={id}` |
| Live odds (one fixture) | GET | `/api/odds/snapshot/{fixtureId}` |
| Odds SSE stream | GET | `/api/odds/stream` (server-sent events) |
| Scores (one fixture) | GET | `/api/scores/...` (+ SSE stream) |
| Merkle proof (score) | GET | three-stage proof for a single score statistic |

Fixtures response fields (confirmed): `FixtureId`, `Participant1`, `Participant2`,
`StartTime`. Odds response shape is **not fully documented** — `txline-client.ts`
fetches and dumps a real odds payload so we map fields once we have a token.

### On-chain subscription program (devnet)
- Program ID: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
- TxL token mint: `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`
- Instruction: `subscribe(service_level_id: u16, weeks: u8)`
- Accounts: `user(signer)`, `pricing_matrix`, `token_mint`, `user_token_account`,
  `token_treasury_vault`, `token_treasury_pda`, `token_program`, `system_program`,
  `associated_token_program`.
- Build with Anchor's TS client (IDL at `/documentation/programs/`). The free WC
  tier is a `service_level_id` of 1 (delayed) or 12 (real-time).

---

## The flagship: a coherent Solana prediction-market stack

```
        TxLine sharp odds  ──►  Edge engine (de-vig, Kelly, CLV)   [x402-polymarket-edge]
   (Solana on-chain sub)             │
                                     ▼
   TxLine scores + Merkle proof ─► SETTLEMENT ORACLE (on-chain verified results)
                                     │
   ┌─────────────────────────┬──────┴──────────────┬──────────────────────────┐
   ▼                         ▼                      ▼
PREDICTION & SETTLEMENT    TRADING TOOLS & AGENTS   CONSUMER & FAN
edge API + settlement      autonomous agent +       "Sharp vs Crowd"
oracle (x402-paid)         dashboard (x402/Bazaar)  fan game (Solana + POH)
```

### 🥇 Bounty 1 — Prediction Markets & Settlement (18k)
- **Edge layer** (have it): TxLine fair value vs Polymarket price → CLV-validated
  signals, paid per query via x402 (Solana USDC), Bazaar-discoverable.
- **Settlement oracle** (the differentiator): TxLine **score + Merkle proof** →
  resolve/grade a prediction market **on-chain**. A Solana program verifies the
  TxODDS Merkle proof and posts the verified result; markets settle trustlessly.
  This is the literal title and almost no one else will use the Merkle proofs.
- Need: settlement-oracle Solana program + proof-verification path.

### 🥇 Bounty 3 — Trading Tools & Agents (16k)
- **Autonomous agent** that pulls TxLine odds, finds edges, sizes via fractional
  Kelly, trades the *path* (the "next-match" idea), runnable in signals/paper mode.
- **Agent pays per data call via x402** (agent-to-agent commerce) consuming our
  own Bazaar-listed edge API — novel and on-theme for Solana.
- **Tools half:** edge dashboard (Kelly, CLV, depth/slippage, next-match screen).
- Need: agent loop + dashboard UI.

### 🥈 Bounty 2 — Consumer & Fan Experiences (16k)
- **"Sharp vs Crowd"**: per match, show what the pros (TxLine) think vs the crowd
  (Polymarket); fans make free picks, scored on **CLV** ("did you beat the close?").
  Leaderboard of who's sharper than the market.
- **Solana** for points/NFT badges/rewards; **Proof-of-Human** (we have it) keeps
  bots off the leaderboard; optional x402 micro-stakes.
- Need: a polished consumer frontend.

---

## Provider adapter — slotting TxLine into the existing engine

`packages/x402-polymarket-edge` already abstracts fair value behind a provider
(`src/data/oddspapi.ts` exposes `getFixtures()` + `getFairProbs(fixture)`). To go
TxODDS-native, add `src/data/txline.ts` with the same two functions backed by
`/api/fixtures/snapshot` + `/api/odds/snapshot/{id}` (de-vig the match-winner
market), and select it with an `ODDS_PROVIDER=txline` switch. The whole engine
(de-vig, Kelly, edge-detector, CLV, x402 gating) is reused unchanged.

---

## Setup checklist (do these first)
- [ ] **t.me/TxLINEChat** — confirm bounty scope + judging, get any data guidance.
- [ ] Solana **devnet** wallet funded; pull the TxLine Anchor IDL from
      `/documentation/programs/devnet`.
- [ ] Run `subscribe(service_level_id=1, weeks=N)` against program
      `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` (free WC tier).
- [ ] `POST /auth/guest/start` → JWT; activate → API token; put both in `.env`.
- [ ] `npm run demo` in this folder → dump real WC fixtures + an odds payload, map
      the odds fields, then wire `src/data/txline.ts` into the edge engine.
- [ ] Read `/documentation/legal/hackathon-terms` before submitting.

## Priorities (realistic for ~1 month)
1. **Bounty 1 + 3 first** — they share ~90% of code we already have.
2. **Bounty 2** if time — same data, fun consumer skin, separate judging pool.
3. Two excellent submissions beat three mediocre ones.
