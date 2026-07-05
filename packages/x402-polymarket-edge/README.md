# @hfsp/x402-polymarket-edge

An **x402-gated edge-signals API** for Polymarket. Pay a small USDC fee per
query and get ranked betting *edges* — markets where Polymarket's crowd price
disagrees with a sharp bookmaker's no-vig fair value (Pinnacle via oddspapi).

**Non-custodial.** This service sells the *alpha*, not the betting. It never
holds funds, never places orders. You take the signal and place/fund the bet
yourself. That keeps it as software, not a broker/custodian.

> Research signals, not financial advice. Prediction markets carry total-loss
> risk. Methodology ported from the private `polysharp` engine — validate with
> **CLV** before sizing up.

## The one idea

A bet is good when its **price is wrong**, not when it's likely to win. The
sharpest public estimate of true probability is a low-margin book's no-vig line.
When Polymarket's price disagrees with that line by more than total costs, the
softer crowd is usually wrong. We surface that gap, at any price level.

```
edge = pFair (de-vigged Pinnacle) − entryPrice (Polymarket best ask)
netEdge = edge − (taker fee + slippage + safety margin)
signal fires when netEdge ≥ MIN_EDGE ; size = fractional Kelly, capped
```

## Pipeline

```
Polymarket Gamma ──▶ liquid markets (≤7d)
oddspapi.io ───────▶ Pinnacle fixtures + odds ──▶ de-vig ──▶ pFair
        │                                              │
        ▼  matcher (fail-closed: both teams present)   ▼
   Polymarket CLOB book (best ask, spread)  ──▶ edge-detector ──▶ Kelly size
                                                          │
                                                          ▼
                                              ranked EdgeSignal[]
```

Every stage **fails closed**: a market that can't be confidently matched or
priced is dropped, never guessed.

## Endpoints

| Method | Path | Cost | Description |
|---|---|---|---|
| `GET` | `/edges?minEdge=0.03&limit=20` | x402 (USDC/Solana) | Ranked edge signals |
| `GET` | `/health` | free | Liveness |
| `GET` | `/` | free | Service info |

The `/edges` route is **Bazaar-discoverable** — the 402 challenge carries the
x402 discovery extension, so it can be listed on agentic.market / x402scan.

Each signal: `{ marketId, question, url, outcomeLabel, tokenId, entryPrice,
pFair, rawEdge, netEdge, kellyStakeUsd, kellyShares, matchConfidence,
fairConfidence, endDate }`.

## Run

```bash
npm install
cp .env.example .env      # set PAYMENT_RECIPIENT_SOL, HELIUS_RPC_URL, ODDS_API_KEY
npm run scan              # inspect the live edge universe locally (no payment)
npm run scan paper        # record current edges as paper bets + settle resolved
npm run scan report       # CLV report — the go-live gate
npm test                  # unit tests for the pure-logic core
npm run build && npm start
```

## CLV gate (paper-first)

Before anyone bets real USDC, prove the edge is real. `paper` records each
signal as a pessimistic paper position; on each run it snapshots the live mid
(closing-line proxy) and settles positions whose markets have resolved on
Gamma; `report` aggregates **average CLV** — the headline metric. The gate
(from polysharp): run to ~200 settled bets; go live only if avg CLV is
positive. No win-rate or ROI number rescues negative CLV. State persists to
`data/polysharp-paper.json` (override with `PAPER_LEDGER_PATH`).

Without `ODDS_API_KEY` the pipeline has no sharp fair value and returns **zero
edges** by design (fail-closed) — it won't invent prices.

## Status / what to refine against live data

Ported & solid (unit-tested): de-vig, fractional Kelly, edge detector, Gamma
scanner, CLOB book reader, fail-closed matcher, x402 gating, Bazaar discovery,
paper engine + CLV report.

Tighten before relying on signals (gated on a live ODDS_API_KEY):
1. `data/oddspapi.ts` parsers vs real oddspapi v4 payloads (`parseFixtures`,
   `parseFairProbs`) — fails closed until validated.
2. `matching/matcher.ts` — team-name normalization for edge cases.
3. Run `npm run scan paper` on a schedule (PM2) to accumulate the ~200 settled
   bets the CLV gate needs.
