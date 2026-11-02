# Bridge Providers — Adapter Specs (5 providers)

The aggregator (`scripts/bridge-aggregator.ts`) ranks these **5 Solana → EVM** providers by net amount-out. Each implements the `BridgeProvider` interface in `scripts/providers.ts`: `supportsPair(srcToken, chain, destToken)`, `quote()`, `execute()`, `status()`.

> All endpoints/SDKs below are starting points — confirm versions against each provider's live docs before implementing. Normalize every quote into `ProviderQuote` (`amountOut` in **destination-token units**, net of provider fee + gas; etaSeconds; reliabilityScore).

---

## 1. Circle CCTP — `cctp` (DEFAULT BENCHMARK)
- **Why:** Native USDC burn-and-mint, **1:1, no slippage**, lowest cost. Every other provider is judged against this.
- **SDK/API:** No price API — it's a protocol. Attestation service (Iris): `https://iris-api.circle.com` (`GET /v1/attestations/{messageHash}`; CCTP v2 supports fast transfers).
- **Flow:** `depositForBurn` on source (Solana TokenMessenger program) → poll Iris for attestation → `receiveMessage` mint on destination EVM.
- **quote():** amountOut ≈ amountIn − dest gas (− fast-transfer fee if CCTP v2 fast). reliabilityScore ~0.99.
- **Solana:** CCTP programs deployed on Solana. Polygon: delivers **native** USDC (note USDC.e mismatch for Polymarket — may need a downstream swap).
- **Docs:** https://developers.circle.com/stablecoins/docs/cctp-getting-started

## 2. Mayan Finance — `mayan`
- **Why:** Solana-native cross-chain (Swift / MCTP / Wormhole routes), strong Solana↔EVM coverage, fast.
- **SDK/API:** `@mayanfinance/swap-sdk`; quote API `https://price-api.mayan.finance/v3/quote`.
- **quote():** call quote API with fromChain=solana, toChain, fromToken=USDC, amount → returns route + expected out + fees. Pick best of returned routes.
- **execute():** build + sign via SDK (`swapFromSolana`), returns source sig; track via Mayan explorer/status.
- **status():** Mayan tracking API by source tx.
- **Docs:** https://docs.mayan.finance

## 3. deBridge (DLN) — `debridge`
- **Why:** Fast intent-based liquidity network, native Solana↔EVM support.
- **API:** `https://dln.debridge.finance/v1.0/dln/order/quote` (quote) and `/create-tx` (build).
- **quote():** params srcChainId (Solana=7565164), dstChainId, srcTokenIn=USDC, amount → estimation with fees + recommended out.
- **execute():** `/create-tx` returns the tx to sign on Solana; order filled by takers on destination.
- **status():** order status endpoint by orderId.
- **Docs:** https://docs.debridge.finance/dln-the-debridge-liquidity-network-protocol

## 4. Wormhole / Portal — `wormhole`
- **Why:** Canonical, battle-tested token bridge; CCTP route also available via Connect. Good fallback.
- **SDK:** `@wormhole-foundation/sdk` (TS). For USDC, prefer its CCTP route; else token-bridge lock/mint.
- **quote():** SDK route quoting; slower (guardian VAA ~ minutes for non-CCTP). Set higher etaSeconds, slightly lower reliabilityScore for wrapped routes.
- **execute():** initiate transfer on Solana → fetch VAA → redeem on destination.
- **status():** poll VAA / redeem status.
- **Docs:** https://wormhole.com/docs/

## 5. Allbridge (Core) — `allbridge`
- **Why:** Stablecoin-focused Solana↔EVM pools; simple USDC routing.
- **SDK/API:** `@allbridge/bridge-core-sdk`; API `https://core.api.allbridge.io`.
- **quote():** SDK `getAmountToBeReceived` (accounts for pool fee + slippage) for USDC Solana→dest.
- **execute():** SDK send (sign on Solana); pools settle on destination.
- **status():** SDK/explorer status by tx.
- **Docs:** https://docs.allbridge.io/

---

## Ranking inputs the aggregator expects from each adapter
`{ provider, amountOut (net, destination-token units), bridgeFeeUSDC, bridgeFeeBps, networkFeesUSDC, etaSeconds, reliabilityScore, route }` — matches `ProviderQuote` in `scripts/types.ts`.

## MVP order (24h)
1. **CCTP** (benchmark) + **Mayan** (Solana-native) → prove aggregation with 2.
2. Add **deBridge** → 3 providers = credible aggregator.
3. Add **Wormhole** + **Allbridge** if time remains.

The HFSP x402 relayer (gnosis-card-x402, generalized) is the **execution/fee layer**, not counted among the 5 external quote providers — it can also be registered as a 6th adapter that carries the integrator fee natively.
