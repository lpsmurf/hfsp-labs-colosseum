# BUILD BRIEF — `solana-scheduled-payments` (Multihopper-backed)

**Separate skill** from solana-x402-bridge. Do not merge the two.
**Goal:** A Solana AI Kit skill that lets an agent create programmable, scheduled, multi-hop SPL token transfers (vesting, payroll, escrow, treasury) via the Multihopper protocol — with client-side signing so keys never leave the agent.

## Why it's a candidate
- Distinct white space: scheduled/recurring on-chain payment pipelines are not covered by the kit's existing skills or the bounty field (escrow has only 1 weak competitor, scheduled-payroll has none).
- Backed by a real protocol (Multihopper) — already-built infra, agent/MCP-ready.
- Strong safety posture: API manages create/prepare/confirm; **signing stays local, private keys never reach the server.**

## What Multihopper provides (the backend)
- Solana-native protocol for scheduled, multi-hop token transfers using on-chain timelocks + a permissionless keeper network.
- Any SPL token (`tokenMint`). Solana only (NOT cross-chain — that's why it's separate from the bridge).
- Lifecycle: **create → prepare → sign locally → broadcast (ordered) → confirm → poll**.
- Auth: `x-api-key` (`mh_live_...` / `mh_test_...`).
- Mainnet compliance: sanctions/risk screening by keeper; flat ~0.002 SOL screening deposit at prepare time (refunded for clean routes).
- Docs: https://dev-docs.multihopper.com/  (agentic: /guides/agentic-integration, MCP: /mcp)

## Modules (4)
1. **create-pipeline** — define recipients, amounts, timing, and sequence; returns a transferId.
2. **prepare-and-sign** — fetch unsigned base64 txs, sign locally (keys never leave client), broadcast in mandatory order (keeper funding → route/orchestrator/session), confirm signatures back to the API.
3. **pipeline-status** — poll completion; handle blockhash expiry (~60s) by re-preparing with a new idempotency key.
4. **compliance-screening** — surface the screening deposit/flow; report flagged routes.

## Use cases to demo
Vesting unlock schedule, payroll batch, milestone escrow release, treasury drip.

## Build order (this is a SECONDARY submission — only after the bridge ships)
1. create-pipeline (REST create) + pipeline-status (poll).
2. prepare-and-sign (the careful part — ordered broadcast, v0 vs legacy signing, never overwrite server pre-signatures).
3. compliance-screening.

## Notes
- Reuse Multihopper's TS examples (@solana/web3.js) for signing/broadcast.
- Keep `sign_and_broadcast` local; everything else is an HTTP wrapper.
- This skill is independent: own repo, own bounty PR.
