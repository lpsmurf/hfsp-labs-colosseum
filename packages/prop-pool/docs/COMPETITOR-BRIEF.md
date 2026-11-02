# Bounty + competitor brief (research 2026-07-05)

## Bounty
- **Listing:** Superteam Earn — "Prediction Markets and Settlement" (sponsor TxODDS).
  https://superteam.fun/earn/listing/prediction-markets-and-settlement
- **Deadline:** submission window closes **2026-07-19**; winners announced ~2026-07-29
  (source: txodds.net World Cup hackathon announcement). Re-confirm on the listing.
- **Prize:** 18,000 USDT for this track (12k / 4k / 2k). Overall hackathon ~$50k / 3 tracks.
- **Judging:** listing references judging criteria in the terms + brief but the exact
  rubric is not public. Terms require submissions to be evaluable without buying
  software/tokens/accounts, and to use **TxLINE data as a primary input** on Solana.
  Prior guidance (handoff): core functionality against live TxLINE data, UX/use-case,
  code quality. Must be built for this hackathon (no legacy projects). Can enter
  multiple tracks but win only one prize.

## Competitors (public)
- **txodds/tx-on-chain** — official reference (not a competitor); source of our IDL.
- **srivtx/sports-workbench** — a *Trading Tools & Agents* track entry (different
  track). Working: backtester + live SSE agent with verifiable Merkle settlement
  receipts. Demonstrates real TxLINE integration but is a trading tool, not a
  betting/settlement market.
- **axis-oracle** — general Solana oracle factory; different data sources (not TxODDS).
- Numerous Telegram prediction-market bots (Jupiter Predict, PredictBot, Predictify,
  PolyXBot) — **all Polymarket/Kalshi based; none use TxLINE on-chain proofs.**
- Could NOT verify `Faadil1/settlement-sentinel` or `Berektassuly/txline-rs` repos
  (private/renamed/not found), so the "stuck on 6004" anecdote is unconfirmed — but
  our M0 shows the 6004 path is genuinely subtle (it's a proof-integrity error, not a
  bucket error; see PROOF_NOTES §4).

## Differentiation for PropPool
1. **Only Telegram-native market that auto-settles from real TxLINE on-chain proofs**
   (CPI into `validate_stat`). No existing Telegram bot does this.
2. **Parametric prop bets** (stat threshold / over-under, incl. two-stat sums like
   total corners) — an official "ideas to get started" suggestion that's under-built,
   vs. the generic binary "bet with friends" pools ~6 teams ship.
3. **Working end-to-end proof settlement** — we already have a real `validate_stat`
   success on devnet + a source-cited `PROOF_NOTES.md` (the step most teams stall on).
4. **Trustless, permissionless settle** — anyone cranks; a liar's proof reverts.
5. **World-Cup-tuned, free-tier data, USDC/SOL stakes** (TxL barred from the money path).
