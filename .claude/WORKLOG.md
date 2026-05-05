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

## KIMI — Status: 🔥 HEAVY LIFTING (START NOW)

**Deadline**: Friday May 8 EOD
**Owns**: All backend infrastructure for `packages/openclaw-platform`

### Task 1 — `packages/openclaw-platform` (port 8788)

Express + TypeScript + SQLite WAL (same pattern as trial-api).

**Schema** (`data/openclaw.sqlite` — WAL mode):
```sql
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, telegram_id TEXT UNIQUE, wallet_address TEXT, tier TEXT DEFAULT 'free', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE subscriptions (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), tier TEXT NOT NULL, payment_token TEXT NOT NULL, amount_per_month TEXT NOT NULL, status TEXT DEFAULT 'active', current_period_start TEXT, current_period_end TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE payments (id TEXT PRIMARY KEY, subscription_id TEXT REFERENCES subscriptions(id), tx_signature TEXT UNIQUE, token TEXT NOT NULL, amount TEXT NOT NULL, verified_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agents (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), name TEXT NOT NULL, status TEXT DEFAULT 'deploying', deploy_type TEXT NOT NULL, container_id TEXT, mcp_port INTEGER, agent_port INTEGER, llm_provider TEXT NOT NULL, llm_model TEXT, custom_endpoint TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE api_keys (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), provider TEXT NOT NULL, encrypted_key TEXT NOT NULL, iv TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE token_usage (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), agent_id TEXT REFERENCES agents(id), month TEXT NOT NULL, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, model TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, month));
```

**Routes**:
- `POST /api/auth/login` — JWT auth (wallet address + signature)
- `GET  /api/subscriptions` — Get user's active subscription
- `POST /api/payments/verify` — Verify Solana tx, create subscription
- `POST /api/agents/deploy` — Deploy user's Docker containers
- `GET  /api/agents` — List user's agents + live status
- `DELETE /api/agents/:id` — Stop + remove agent containers
- `GET  /api/health` — Health check
- `GET  /api/usage/tokens` — Token usage this month

**Services to build**:

`payment-verifier.ts` — Verify Solana tx via Helius:
- Check recipient = PLATFORM_WALLET_ADDRESS
- Check token = SOL/USDC/USDT/HERD with correct mint
- Check amount >= tier price
- tx_signature UNIQUE prevents double-spend
- Reuse pattern from `packages/clawdrop-mcp/src/services/fee-collector.ts`

`key-vault.ts` — AES-256-GCM encrypt/decrypt user API keys

`llm-router.ts`:
- `poly`: use POLY_OPENROUTER_KEY env, track tokens
- `byok`: decrypt user's key, route to their provider
- `custom`: route to user's custom_endpoint

`docker-deployer.ts`:
```bash
docker network create user-${userId}
docker run -d --name mcp-${userId} --network user-${userId} -p ${mcpPort}:3002 -e USER_ID -e HELIUS_API_KEY openclaw/mcp-server:latest
docker run -d --name agent-${userId} --network user-${userId} -p ${agentPort}:3999 -e MCP_URL=http://mcp-${userId}:3002 -e LLM_PROVIDER openclaw/agent-runtime:latest
```

### Task 2 — `packages/openclaw-mcp-server`

Dockerfile + Node.js server that:
1. Inits SolanaAgentKit with env-injected keys (HELIUS_API_KEY, user's LLM key)
2. Starts MCP server using `@solana-agent-kit/adapter-mcp` on port 3002
3. Health endpoint on port 3003

### Task 3 — `packages/openclaw-agent-runtime`

Dockerfile + autonomous loop:
1. Connects to MCP server at `MCP_URL` env var
2. Loop: analyze conditions → call tools → execute if needed → sleep 60s
3. Health endpoint on port 3999
4. All actions logged to stdout

**Completed**:
- (nothing yet — START NOW)

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
