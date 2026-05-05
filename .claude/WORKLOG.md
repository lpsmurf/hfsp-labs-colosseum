# WORKLOG — Live Task Board

> Last updated: 2026-05-06 UTC
> **STATUS**: 🚧 PHASE 2 — Openclaw Platform (ship by Saturday May 9)

---

## MISSION: Openclaw Autonomous Agent Platform

**Deadline**: Saturday May 9, 2026
**Goal**: Subscribe → Pay in SOL/USDC/USDT/HERD → One-click deploy → 24/7 autonomous Solana agent running

**Architecture**: Per-user isolated Docker containers (MCP server + autonomous agent). Starter = shared VPS.

**Full plan**: `/Users/mac/.claude/plans/squishy-wandering-newt.md`
**Product strategy**: `docs/PRODUCT_STRATEGY.md`

---

## KIMI — Status: ✅ DAY 1 COMPLETE

**Deadline**: Friday May 8 EOD
**Owns**: All backend infrastructure for `packages/openclaw-platform`

### Task 1 — `packages/openclaw-platform` (port 8788) — IN PROGRESS

**Completed Day 1 (May 6)**:
- ✅ `payment-verifier.ts` — Helius tx verification for SOL/USDC/USDT/HERD
  - Fetches tx from Helius API, parses native + SPL transfers
  - Checks recipient = PLATFORM_WALLET_ADDRESS
  - Checks amount >= tier price (with SOL→USD conversion via CoinGecko)
  - Double-spend protection via DB UNIQUE on tx_signature
- ✅ `routes/payments.ts` — POST /api/payments/verify + GET /api/payments/quote
- ✅ `routes/auth.ts` — POST /api/auth/login + GET /api/auth/me (JWT)
- ✅ `routes/subscriptions.ts` — GET /api/subscriptions
- ✅ `routes/agents.ts` — GET /api/agents, POST /api/agents/deploy, DELETE /api/agents/:id
- ✅ `routes/usage.ts` — GET /api/usage/tokens
- ✅ `server.ts` — All routes wired, CORS, health check
- ✅ `.env.example` — Documented all required env vars
- ✅ TypeScript compiles cleanly, server starts on :8788

**Branch**: `kimi/openclaw-platform-routes`

**Remaining (Day 2-3)**:
- `services/docker-deployer.ts` — Docker Compose per-user deployment
- `services/llm-router.ts` — Poly/BYOK/custom endpoint routing
- `services/token-tracker.ts` — Token counting + budget alerts
- Wire docker-deployer into agents/deploy route
- Add subscription check to deploy endpoint

### Task 2 — `packages/openclaw-mcp-server`

**Status**: Not started (Day 2)

### Task 3 — `packages/openclaw-agent-runtime`

**Status**: Not started (Day 2)

---

## CLAUDE — Status: ✅ DAY 1+2 COMPLETE — BUILDING IMAGES

**Owns**: Agent Kit tool integration + platform scaffold + infrastructure wiring

### Completed (May 6):
- ✅ Scaffold `packages/openclaw-platform` (server.ts, db/schema.ts, all routes) → handed to Kimi
- ✅ Nginx: openclaw-platform upstream + `/api/platform/` route
- ✅ docker-compose.trial.yml: openclaw-platform service on port 8788
- ✅ `services/api.ts` — `PlatformApiClient` with 7 platform methods
- ✅ `pages/Deploy.tsx` — 7-step wizard (wallet → payment → LLM → config → deploy → success)
- ✅ `pages/Agents.tsx` — platform API, 5s polling, stop button, port view
- ✅ `routes/agents.ts` — docker-deployer wired (async deploy, BYOK key vault, live status sync)
- ✅ `services/llm-router.ts` — Poly/BYOK/Custom routing + token tracking
- ✅ `services/token-tracker.ts` — budget tracking with 80/100/125% alerts
- ✅ Architecture plan, product strategy, all tech decisions

### Remaining (orchestrator role):
- [ ] E2E test — run `bash scripts/test-platform-e2e.sh` once Kimi finishes images
- [ ] Production deploy — after E2E green

---

## CODEX — Status: 🎨 FRONTEND SPRINT

**Owns**: All new UI components for subscription + deploy flow

### Task 1 — `PaymentModal.tsx` (NEW component)

Phantom wallet payment flow for subscribing:
- Show tier selected (Starter $19 / Pro $59)
- Token selector: SOL | USDC | USDT | HERD
- Live price quote (call `/api/platform/payments/quote`)
- "Pay with Phantom" button → opens Phantom with pre-filled transfer
- After tx signed → POST tx_signature to `/api/platform/payments/verify`
- Success → proceed to deploy

### Task 2 — Update `Deploy.tsx`

Wire to real backend:
1. Step 1: Payment check (is user subscribed? if not → PaymentModal)
2. Step 2: LLM setup (Poly keys / BYOK / custom endpoint selector)
3. Step 3: Agent config (name, strategy)
4. Step 4: Deploy button → POST `/api/platform/agents/deploy` → loading state
5. Step 5: Success → redirect to Agents page

### Task 3 — Update `Agents.tsx`

Show real agents from API:
- Poll GET `/api/platform/agents` every 5s
- Show status badge: deploying / active / stopped / failed
- Show agent name, LLM model, created_at
- Stop agent button → DELETE `/api/platform/agents/:id`
- Collapsed view: MCP port, agent port (for power users)

### Task 4 — Update `PaywallModal.tsx`

Current modal has hardcoded "0.5 SOL/month". Update to:
- "Deploy your own Poly agent"
- Starter: 19 USDC/month
- "Deploy Now" button → links to `/deploy`

**Completed**:
- ✅ Base UI components (ChatBox, MessageList, ToolCallCard) — Phase 1

---

## GEMINI — Status: 📋 STANDBY

**When Claude finishes nginx config (May 8)**, Gemini:
- Verify nginx routes `/api/platform/*` on production
- Confirm HTTPS works for new endpoints
- Test CORS headers

---

## Token Prices (Solana Payments)

| Tier | USDC | USDT | SOL (live price) |
|------|------|------|-----------------|
| Starter | 19 | 19 | ~0.12 (live) |
| Pro | 59 | 59 | ~0.38 (live) |

HERD pricing: TBD by team

**Platform wallet**: `PLATFORM_WALLET_ADDRESS` env var
**Token mints**:
- USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- USDT: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- SOL: native
- HERD: `HERD_MINT_ADDRESS` env var

---

## Inbox

### → KIMI
**Day 2 priorities (May 6 remaining)**:

1. **Build + push Docker images** — this unblocks E2E
   - `openclaw/mcp-server` — source at `packages/openclaw-mcp-server/`. Fixed bugs: `KeypairWallet(keypair, rpcUrl)` (2 args), only TokenPlugin + DefiPlugin (NFT/Misc have version conflicts), `startMcpServer(agent.actions, agent, { port })`. Run `npm run build` locally first to verify, then `docker build`.
   - `openclaw/agent-runtime` — source at `packages/openclaw-agent-runtime/`. Should build cleanly.

2. **llm-router.ts + token-tracker.ts** — Claude already created these in `services/`. Review and integrate into agents route if needed.

3. **Test docker-deployer** — `deployStarter()` in `services/docker-deployer.ts` is fully wired into `routes/agents.ts`. Spin up a test deploy locally.

### → CODEX
**One task remaining**: `PaymentModal.tsx`

`Deploy.tsx` and `Agents.tsx` are already wired (Claude did it). Your only job is replacing the `window.prompt()` placeholder in the payment step of `Deploy.tsx` (search for `window.prompt` in that file) with a proper Phantom transfer modal.

The modal should:
- Show selected tier + token (props from Deploy.tsx)
- Call `GET /api/platform/payments/quote?tier=starter` for SOL price
- Trigger Phantom transfer to platform wallet
- On tx confirmed → call `platformClient.verifyPayment()` (already in api.ts)
- On success → call `onSuccess()` callback so Deploy.tsx advances

Also update `PaywallModal.tsx` copy: "0.5 SOL/month" → "From 19 USDC/month", CTA → links to `/deploy`.

### → CLAUDE (self)
Start with openclaw-platform scaffold + trial-api Agent Kit replacement today.
