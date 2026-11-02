---
name: polymarket-bet
description: Place and redeem bets on Polymarket using USDC.e on Polygon. Requires USDC on Polygon first (bridge via bridge-execute). Use for "bet on Polymarket", "buy YES/NO shares", "redeem my winnings". Demo flagship of the cross-chain skill.
---

# polymarket-bet

> **Status: ROADMAP.** Reading markets is live (`polymarket-read`). Placing CLOB orders needs
> order signing + USDC.e on Polygon and is not yet implemented. The cross-chain funding path
> for it (bridge USDC → Polygon) is live today via `bridge-execute`.

Place / redeem Polymarket bets. Polygon USDC.e required — bridge first via `bridge-execute`.

## Flow
1. Ensure USDC.e balance on Polygon (else trigger bridge-quote → safety → execute).
2. Place order via CLOB (market or limit), specify outcome (YES/NO) + size.
3. Return order id + resulting position.
4. Redeem after resolution.

## Rules
- Confirm market is open and not near-resolution before betting.
- Respect spend caps from bridge-safety config.
- Demo with small amounts.

Run `scripts/polymarket.ts bet <marketId> <YES|NO> <amount>`.
