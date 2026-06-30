---
name: prepare-and-sign
description: Fetch unsigned Multihopper transactions, sign them locally (private keys never leave the client), and broadcast in the mandatory order, confirming signatures back to the API. Use after create-pipeline. Handles v0 versioned and legacy transactions.
---
# prepare-and-sign
1. `/prepare` → unsigned base64 txs in groups.
2. Sign locally — for v0, ADD your signature to existing slots (do NOT overwrite server pre-signatures); legacy uses partial sign.
3. Broadcast in order: keeper funding first, then route/orchestrator/session.
4. Confirm signatures to the API twice (after keeper funding, then after the rest).
Keys never leave the client. Run `scripts/prepare-and-sign.ts`.
