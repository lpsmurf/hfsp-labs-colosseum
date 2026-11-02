---
name: bridge-quote
description: Quote a USDC bridge from Solana to an EVM chain. Returns route, transparent fee breakdown, network fees, amount out, and ETA. Always call before bridge-execute. Use for "how much to bridge", "bridge quote", "cost to send USDC to Polygon/EVM".
---

# bridge-quote

Read-only. Quote a Solana→EVM transfer by aggregating the currently wired provider adapters.

## Input
`amountUSDC`, `destChain` (see evm-targets), `destToken` (default USDC).

## Output (always disclose the fee)
Shape only — every value comes from the selected quote:
```json
{
  "route": "<srcToken> Solana → <destChain> <destToken> (<provider>)",
  "amountIn": "<amountIn> <srcToken>",
  "bridgeFee": "<bridgeFeeUSDC> USDC (<bridgeFeeBps> bps)",
  "networkFees": "<networkFeesUSDC> USDC",
  "amountOut": "<amountOut> <destToken>",
  "minAmountOut": "<minAmountOut> <destToken>",
  "etaSeconds": "<etaSeconds>",
  "feeRecipient": "<recipient returned by the selected adapter>",
  "relayer": "<only present for the HFSP relayer route, e.g. X402_RELAYER_URL>"
}
```

## Rules
- Provider fees come from each adapter quote. `INTEGRATOR_FEE_BPS` is currently used only to rank quotes (net of that fee); it does not reduce the reported `amountOut` and no separate integrator fee recipient is emitted.
- Never hide or round away the fee — it is a feature, show it in full.
- Run `scripts/bridge-quote.ts`.
