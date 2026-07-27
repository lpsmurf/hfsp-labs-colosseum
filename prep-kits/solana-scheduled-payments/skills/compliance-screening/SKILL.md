---
name: compliance-screening
description: Handle Multihopper mainnet sanctions/risk screening for scheduled transfers — the refundable screening deposit and flagged-route reporting. Use for "compliance check", "is this route screened", "screening fee".
---
# compliance-screening
On mainnet, the keeper screens routes post-deployment. A flat ~0.002 SOL deposit is taken at prepare time — refunded for clean routes, forfeited for flagged wallets. Surface status + reason to the user. Run `scripts/pipeline-status.ts` (screening fields).
