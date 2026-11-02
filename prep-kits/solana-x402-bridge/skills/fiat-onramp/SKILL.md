---
name: fiat-onramp
description: Fund a Solana agent with fiat (card/bank) or cash out to fiat, via Onramper — an aggregator of 20+ on/off-ramp providers across 130+ payment methods. Returns the best ranked onramp/offramp quote, disclosed transparently. Use for "fund with fiat", "buy USDC with card", "onramp", "cash out to bank", "offramp winnings".
---

# fiat-onramp

Onramper integration — the fiat aggregator that mirrors our bridge aggregator.

> **Status:** the cross-chain **bridge aggregation is LIVE and proven on mainnet** (real round-trip txs). This **Onramper fiat layer currently runs against Onramper's SANDBOX** (staging API / test key) — onramp quotes work end-to-end in sandbox; production fiat on/off-ramp is wired and coming soon.

## Onramp (fiat -> crypto)
- Quote fiat -> USDC delivered on Solana OR directly on the destination EVM chain.
- Onramper ranks 20+ providers; surface its best quote next to the bridge quote so the agent picks "fund + bridge" vs "fund directly on destination".

## Offramp (crypto -> fiat)
- Quote USDC -> fiat for cashing out (e.g. Polymarket winnings).

## Rules
- Quote-first, fee always disclosed (same rule as bridges).
- API key via env (`ONRAMPER_API_KEY`); requests signed. Widget or pure API.
- Supports onramp, offramp, and crypto swaps via one unified API.

Run `scripts/onramp.ts quote|offramp ...`.
