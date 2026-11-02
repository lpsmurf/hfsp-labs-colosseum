---
name: create-pipeline
description: Define a scheduled multi-hop SPL token transfer on Solana — recipients, amounts, timing, and sequence — and create it via the Multihopper API, returning a transferId. Use for "schedule payments", "set up vesting/payroll", "create a payment pipeline".
---
# create-pipeline
`POST /api/v1/transfers` with the pipeline definition (tokenMint, recipients, amounts, timing/sequence); receive a transferId. Then proceed to prepare-and-sign. Required headers: `x-api-key` and `Idempotency-Key` (a fresh UUID per POST; Multihopper rejects POSTs without it with MH_070). Run `scripts/create-pipeline.ts`.
