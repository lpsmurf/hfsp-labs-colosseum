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

## CLAUDE — Status: 🔧 WORKING

**Owns**: Agent Kit tool integration + platform scaffold + infrastructure wiring

### Day 1 (May 6 — Today):
- [ ] Scaffold `packages/openclaw-platform` skeleton (server.ts, db/schema.ts, routes structure) → hand to Kimi
- [ ] Replace trial-api 5 custom tools with Agent Kit wrappers
- [ ] Install `solana-agent-kit`, `@solana-agent-kit/plugin-token`, `@solana-agent-kit/plugin-misc` in trial-api

### Day 2 (May 7):
- [ ] Wire `packages/trial-frontend/src/services/api.ts` — add openclaw-platform client methods
- [ ] Update `Deploy.tsx` — connect to POST `/api/platform/agents/deploy`
- [ ] Update `Agents.tsx` — connect to GET `/api/platform/agents` with status polling

### Day 3 (May 8):
- [ ] Add openclaw-platform to `config/nginx/conf.d/trial.conf`
- [ ] Add openclaw-platform service to `docker-compose.trial.yml`
- [ ] Run E2E test: subscribe → pay → deploy → agent running
- [ ] Deploy to clawdrop.live

**Completed**:
- ✅ Architecture plan (`/Users/mac/.claude/plans/squishy-wandering-newt.md`)
- ✅ Product strategy (`docs/PRODUCT_STRATEGY.md`)
- ✅ All tech decisions confirmed

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
🚨 3-day sprint. You have the heaviest backend work.
START: `packages/openclaw-platform` (port 8788)
Pattern to follow: `packages/trial-api/src/rate-limit.ts` (SQLite) + `packages/trial-api/src/server.ts` (Express)
Reuse payment logic from: `packages/clawdrop-mcp/src/services/fee-collector.ts`
Full spec above. Full plan: `/Users/mac/.claude/plans/squishy-wandering-newt.md`

### → CODEX
Frontend sprint — 3 components needed.
Main new one: `PaymentModal.tsx` (Phantom wallet + token selector + payment verify)
Then wire `Deploy.tsx` and `Agents.tsx` to the new backend.
Full spec above.

### → CLAUDE (self)
Start with openclaw-platform scaffold + trial-api Agent Kit replacement today.
