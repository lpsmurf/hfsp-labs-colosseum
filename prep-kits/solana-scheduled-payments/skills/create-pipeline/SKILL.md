---
name: create-pipeline
description: Define a scheduled multi-hop SPL token transfer on Solana — recipients, amounts, timing, and sequence — and create it via the Multihopper API, returning a transferId. Use for "schedule payments", "set up vesting/payroll", "create a payment pipeline".
---
# create-pipeline
POST the pipeline definition (tokenMint, recipients, amounts, timing/sequence) to Multihopper; receive a transferId. Then proceed to prepare-and-sign. Auth via x-api-key. Run `scripts/create-pipeline.ts`.
