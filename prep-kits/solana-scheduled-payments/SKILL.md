---
name: solana-scheduled-payments
description: Create and manage scheduled, multi-hop SPL token transfer pipelines on Solana — vesting, payroll, escrow, treasury drips — via the Multihopper protocol, with client-side signing (keys never leave the agent). Use for "schedule a payment", "vesting schedule", "payroll", "milestone escrow", "recurring transfer", "treasury drip".
---

# solana-scheduled-payments

Router for Multihopper-backed scheduled payments. Solana-only (for cross-chain use `solana-x402-bridge`).

1. **Define a schedule?** → `skills/create-pipeline`.
2. **Sign + broadcast?** → `skills/prepare-and-sign` — keys stay local; broadcast in mandatory order.
3. **Check progress?** → `skills/pipeline-status` — poll; re-prepare on blockhash expiry.
4. **Mainnet compliance?** → `skills/compliance-screening`.

## Golden rules
- Signing is always local — never send private keys to the API.
- Broadcast groups in order; each must confirm before the next.
- On mainnet, account for the screening deposit (~0.002 SOL, refundable for clean routes).
