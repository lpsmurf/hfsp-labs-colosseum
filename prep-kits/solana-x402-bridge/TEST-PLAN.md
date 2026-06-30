# TEST-PLAN.md — solana-x402-bridge

Small-amount, reproducible runs that double as the demo. Use tiny sizes; this moves real funds.

## 0. Prereqs
- `.env` filled: Solana RPC (+ fallbacks), per-chain EVM RPC (+ fallbacks), `X402_RELAYER_URL`, fee config, caps, `ONRAMPER_API_KEY` (optional).
- Demo wallets funded with small amounts (e.g. 5 USDC on Solana; ~0.02 SOL for the swap test).
- `npm install` in the skill package.

## 1. Aggregation correctness (USDC bridge) — the headline
```bash
npx tsx scripts/bridge-quote.ts USDC 5 polygon USDC
```
Expect: `BEST (bridge)` plus a ranked COMPARISON across eligible providers (cctp, mayan, debridge, wormhole, allbridge).
Pass: CCTP appears with `priceImpactBps: 0`; fee line disclosed; ranking sorted by net `amountOut`.

## 2. Cross-chain swap quote (SOL → ETH) — second capability
```bash
npx tsx scripts/bridge-quote.ts SOL 0.1 ethereum ETH
```
Expect: eligible set narrows to **mayan + debridge** only (cctp/allbridge/wormhole filtered by supportsPair).
Pass: each quote shows `kind: "swap"`, non-zero `priceImpactBps`, and a `minAmountOut`.

## 3. Safety preflight — must BLOCK bad states
Run each and confirm it fails loud:
```bash
# a) destination not allowlisted
DEST_ALLOWLIST=gnosis npx tsx scripts/bridge-execute.ts USDC 5 polygon USDC      # -> blocked: not in allowlist
# b) over per-tx cap
MAX_BRIDGE_USDC_PER_TX=1 npx tsx scripts/bridge-execute.ts USDC 5 polygon USDC    # -> blocked: exceeds cap
# c) stale/dead Solana RPC (point primary at a bad URL, no fallback)
SOLANA_RPC_URL=https://api.invalid SOLANA_FALLBACK_RPCS= npx tsx scripts/bridge-execute.ts USDC 5 polygon USDC  # -> blocked: Solana RPC
# d) dead EVM RPC
POLYGON_RPC_URL=https://api.invalid POLYGON_FALLBACK_RPCS= npx tsx scripts/bridge-execute.ts USDC 5 polygon USDC # -> blocked: polygon RPC
```
Pass: every case returns "Safety preflight failed: ..." and does NOT execute.

## 4. RPC failover — must RECOVER
```bash
# bad primary + good fallback => should succeed via fallback, slotLag within bound
SOLANA_RPC_URL=https://api.invalid \
SOLANA_FALLBACK_RPCS=$GOOD_SOLANA_RPC \
npx tsx scripts/bridge-quote.ts USDC 5 polygon USDC
```
Pass: quote succeeds; switcher selected the healthy fallback. Repeat for `POLYGON_RPC_URL` + `POLYGON_FALLBACK_RPCS`.

## 5. Execute (real, small) — USDC Solana → Polygon
```bash
npx tsx scripts/bridge-execute.ts USDC 5 polygon USDC
```
Pass: returns `{sourceTx, destTx, statusId}` + explorer links; USDC arrives on Polygon (~45–90s). NOTE the USDC.e vs native-USDC handling for the Polymarket leg.

## 6. Polymarket demo
```bash
npx tsx scripts/polymarket.ts read worldcup        # list markets + odds
npx tsx scripts/polymarket.ts bet <marketId> YES 5 # place small bet
```
Pass: market list returns odds; bet returns a position.

## 7. Optional — fiat funnel (Onramper)
```bash
npx tsx scripts/onramp.ts quote USD 20 solana      # best ranked fiat->USDC quote, fee disclosed
```
Pass: returns a ranked provider quote with disclosed fee.

## Demo recording order (60s)
Step 1 (aggregation) → step 3c (safety blocks stale RPC) → step 5 (execute) → step 6 (bet).
That sequence shows: best-rate aggregation, safety, real settlement, real action — the full story.
