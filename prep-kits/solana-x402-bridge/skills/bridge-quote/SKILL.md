---
name: bridge-quote
description: Quote a USDC bridge from Solana to an EVM chain. Returns route, transparent fee breakdown, network fees, amount out, and ETA. Always call before bridge-execute. Use for "how much to bridge", "bridge quote", "cost to send USDC to Polygon/EVM".
---

# bridge-quote

Read-only. Quote a Solana→EVM USDC bridge via the x402 relayer.

## Input
`amountUSDC`, `destChain` (see evm-targets), `destToken` (default USDC).

## Output (always disclose the fee)
```json
{
  "route": "USDC Solana → Polygon (x402)",
  "amountIn": "5.00 USDC",
  "bridgeFee": "0.0075 USDC (15 bps)",
  "networkFees": "~0.01 USDC",
  "amountOut": "4.98 USDC",
  "etaSeconds": 45,
  "feeRecipient": "<integratorFeeAccount or HFSP default>",
  "relayer": "https://bridge.clawdrop.live"
}
```

## Rules
- Fee = relayer x402 price. Configurable via INTEGRATOR_FEE_BPS / INTEGRATOR_FEE_ACCOUNT.
- Never hide or round away the fee — it is a feature, show it in full.
- Run `scripts/bridge-quote.ts`.
