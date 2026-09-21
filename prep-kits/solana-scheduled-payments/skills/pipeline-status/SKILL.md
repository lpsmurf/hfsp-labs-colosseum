---
name: pipeline-status
description: Poll a Multihopper transfer pipeline for completion status and handle blockhash expiry by re-preparing with a new idempotency key. Use for "check my scheduled payment", "is the vesting done", "transfer status".
---
# pipeline-status
Poll completion. Solana blockhashes expire ~60s after prepare — on failure call `/prepare` again with a new idempotency key; already-confirmed groups return null (graceful resume). Run `scripts/pipeline-status.ts`.
