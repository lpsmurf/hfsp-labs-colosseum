# Poly Deployment — Prep Kit for VSCode Claude Code

**Handed off:** 2026-05-07
**Audience:** Claude Code instance running in VSCode against `/Users/mac/hfsp-labs-colosseum`
**Status:** Architecture locked. Ready to build. Three external assets required before code begins.

---

## TL;DR — What you're building

Replace the multi-step deployment wizard with a one-click flow:

```
User pays SOL → backend deploys Poly container with pre-baked LLM + Telegram → user gets a deeplink → /start in Telegram → agent is live in chat.
```

The wizard stays untouched for power users. Poly is the new default product.

Reference UX (study before coding): https://www.suzi.trade/ — specifically "Suzi Claw" Telegram interface.

---

## Locked architectural decisions

| # | Decision | Locked Choice |
|---|----------|---------------|
| 1 | Product positioning | Poly = curated free tier with pre-baked Telegram + LLM + crypto bundles. Wizard remains for power users (do NOT touch it). |
| 2 | LLM payment model | Clawdrop holds the OpenRouter **provisioning key**. Each paid user gets a programmatically-created **child API key** with a hard credit limit equal to their SOL deposit (converted to USD). OpenRouter becomes the metering layer — replaces most of `token-tracker.ts`. |
| 3 | Default LLM model | `anthropic/claude-haiku-4.5` via OpenRouter (better tool use, looks smart on stage, supports prompt caching). |
| 4 | Telegram architecture | **One shared bot** (`@ClawdropPoly_bot`), per-user routing by `chat_id → user_id` lookup. Do NOT create one bot per user — Telegram requires human BotFather interaction. |
| 5 | x402 / pay.sh for LLM | v2 narrative only. Friday demo uses fiat-settled OpenRouter. |
| 6 | Dev mode | v2. Not Friday scope. Don't branch for it. |
| 7 | SOL → USD price source | CoinGecko for v1 (fastest). Pyth as a v2 polish item. |

---

## Repository state (as of handoff)

Branch: `main`
Latest commit: `ef4f162 merge(kimi/mcp-external-tools): x402engine (22 tools) + invy.bot wallet portfolio`

### What already exists (do NOT rebuild)

| Path | State | Use it for |
|------|-------|-----------|
| `packages/openclaw-platform/src/services/docker-deployer.ts` | ✅ Working | Container spin-up. Will need extension for Poly defaults. |
| `packages/openclaw-platform/src/services/llm-router.ts` | ✅ Working | OpenAI-compat. Slot OpenRouter in here. |
| `packages/openclaw-platform/src/services/key-vault.ts` | ✅ Working | Encrypted storage for child API keys. |
| `packages/openclaw-platform/src/services/payment-verifier.ts` | ✅ Working | On-chain SOL verification. |
| `packages/openclaw-platform/src/services/token-tracker.ts` | ⚠️ Will become mostly redundant | OpenRouter replaces this. Don't delete yet — wizard flow still uses it. |
| `packages/openclaw-platform/src/routes/agents.ts` | ✅ Working | Existing endpoints. **Add** `/quick-deploy` here, do NOT modify existing endpoints. |
| `packages/agent-provisioning/services/telegram-bot/` | ⚠️ Skeleton | Webhook server + message parser exist. Brain wiring missing. |
| `packages/openclaw-agent-runtime/src/agent.ts` | ⚠️ Empty loop | This is THE bottleneck. The `// TODO: connect to MCP server and run strategy` block is what you fill in. |
| `packages/clawdrop-mcp-server/` | ✅ 99 tools live | Includes Kimi's x402engine bundle. Consume tools, don't modify. |

### What does NOT exist yet (you build)

1. OpenRouter provisioning client (`services/openrouter-provisioner.ts`)
2. Telegram pairing/deeplink service (`services/telegram-pairing.ts`)
3. Quick-deploy endpoint (`routes/agents.ts → POST /quick-deploy`)
4. Agent brain (`agent-runtime/src/agent.ts` — replace the TODO)
5. Telegram → agent message router (`telegram-bot/src/handlers/webhook.ts` extension)

---

## External assets required BEFORE coding (blockers)

The user needs to provide these. Ask for them in your first message and STOP if any are missing.

### 1. OpenRouter provisioning key
- Where: https://openrouter.ai/settings/provisioning-keys
- One-time generation. Store as `OPENROUTER_PROVISIONING_KEY` in `.env` (server-side only — never inject into containers).
- This key can mint child keys with unlimited credit. **Treat it like an AWS root key.**

### 2. Telegram bot token
- Created via BotFather (the only step that can't be automated).
- Suggested bot name: `@ClawdropPoly_bot`
- Store as `TELEGRAM_BOT_TOKEN` in `.env`.
- Bot must have privacy mode disabled (`/setprivacy → Disable` in BotFather) so it can read group messages.

### 3. Default credit allocation per service tier
- Confirm with user. Suggested defaults:
  - Treasury Agent Pro: $5 USD credit
  - Custom: based on SOL paid × spot
- Store in `services` table.

---

## Build plan — strict ordering

### Phase 1: OpenRouter provisioner (Day 1, AM)

**File:** `packages/openclaw-platform/src/services/openrouter-provisioner.ts`

Functions to expose:
```ts
createUserKey(userId: string, limitUsd: number): Promise<{ keyHash: string; key: string }>
getKeyUsage(keyHash: string): Promise<{ usage: number; limit: number; remaining: number }>
topUpKey(keyHash: string, additionalUsd: number): Promise<void>
deleteKey(keyHash: string): Promise<void>
```

Endpoints to call (from OpenRouter docs):
- `POST https://openrouter.ai/api/v1/keys` — create
- `GET https://openrouter.ai/api/v1/keys/{hash}` — read
- `PATCH https://openrouter.ai/api/v1/keys/{hash}` — update limit
- `DELETE https://openrouter.ai/api/v1/keys/{hash}` — revoke

Auth header: `Authorization: Bearer ${OPENROUTER_PROVISIONING_KEY}`.

**After creating, encrypt the returned key with `key-vault.ts` and store keyed by userId.** Do not log it. Do not return it from any HTTP endpoint.

**Verification:** unit test that creates a $0.01 key, queries it, deletes it. If your provisioning key is valid, all three calls return 200.

---

### Phase 2: Agent brain (Day 1, PM) — CRITICAL PATH

**File:** `packages/openclaw-agent-runtime/src/agent.ts`

Replace the empty `runLoop()` with a request-driven message handler. The agent should NOT poll on a timer — it should expose an HTTP endpoint that the Telegram bot calls.

Required env vars:
- `USER_ID`
- `LLM_API_KEY` (the OpenRouter child key)
- `LLM_MODEL` (default `anthropic/claude-haiku-4.5`)
- `LLM_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `MCP_URL` (existing)

Add endpoint:
```
POST /message
{ "text": "what is SOL price?", "chat_id": 12345 }
→ { "reply": "SOL is at $187.42 right now." }
```

Inside the handler:
1. Build system prompt (Poly persona — paste from below).
2. Call OpenRouter chat completion with tools list pulled from MCP.
3. If tool call returned: execute via MCP client, feed result back, get final reply.
4. Return reply text.
5. Track conversation history per `chat_id` in memory (Map). v2 = persist.

Use the `mcp` SDK's HTTP client to talk to MCP server (already running on `MCP_URL`).

**Poly system prompt (use exactly):**
```
You are Poly, a crypto-native AI agent on Solana. You help users check prices,
analyze wallets, swap tokens, and monitor markets through your built-in tools.
Be concise, action-oriented, and never speculate about prices. When a user asks
for an action you can execute (swap, balance check, price lookup), call the
appropriate tool immediately rather than asking clarifying questions when the
intent is clear. All swaps execute on Solana devnet during the trial period.
```

**Verification:** `curl -X POST localhost:3999/message -d '{"text":"hi","chat_id":1}'` returns a coherent reply.

---

### Phase 3: Telegram routing (Day 2, AM)

**File:** `packages/agent-provisioning/services/telegram-bot/src/handlers/webhook.ts` (extend)
**New file:** `packages/openclaw-platform/src/services/telegram-pairing.ts`

Database additions (new table or extend users):
```sql
CREATE TABLE IF NOT EXISTS telegram_pairings (
  pair_code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id INTEGER,
  paired_at INTEGER,
  expires_at INTEGER NOT NULL
);
```

Pairing flow:
1. On `quick-deploy` success, generate a 6-char `pair_code` (e.g. `K3NZ9P`), store with `user_id`, expire in 1h.
2. Return deeplink to user: `https://t.me/ClawdropPoly_bot?start=<pair_code>`
3. User clicks deeplink → Telegram sends `/start <pair_code>` to bot.
4. Webhook handler extracts pair_code, looks up user_id, fills in `chat_id`, marks paired.
5. Subsequent messages from that `chat_id` route to that user's agent container.

Routing logic in webhook handler:
```
chat_id → look up user_id in telegram_pairings
user_id → look up agent container address (from existing agents table)
POST {agentAddress}/message { text, chat_id }
Reply text → send back to Telegram chat_id
```

**Verification:** click the deeplink, send a message in Telegram, see Poly reply.

---

### Phase 4: Quick-deploy endpoint (Day 2, PM)

**File:** `packages/openclaw-platform/src/routes/agents.ts` (extend)

Add `POST /agents/quick-deploy`:

Request:
```json
{
  "wallet": "7qj...",
  "tx_hash": "5xK...",
  "tier": "poly-treasury"
}
```

Server steps (in order, fail-fast):
1. Verify tx_hash via existing `payment-verifier.ts`.
2. Convert paid SOL → USD (CoinGecko).
3. Create OpenRouter child key with that USD as limit.
4. Encrypt + store child key in key_vault.
5. Call `docker-deployer.ts` with Poly defaults:
   - `LLM_PROVIDER=poly`
   - `LLM_API_KEY={childKey}`
   - `LLM_MODEL=anthropic/claude-haiku-4.5`
   - `LLM_BASE_URL=https://openrouter.ai/api/v1`
6. Generate pair_code, store pairing.
7. Return:
```json
{
  "agent_id": "...",
  "telegram_deeplink": "https://t.me/ClawdropPoly_bot?start=K3NZ9P",
  "credits_usd": 5.00,
  "expires_at": 1234567890
}
```

**Verification:** end-to-end manual run: pay devnet SOL → call endpoint → receive deeplink → click → chat in Telegram → bot responds with token price using a real MCP tool.

---

### Phase 5: Crypto tool wiring + demo polish (Day 3-4)

Wire these specific MCP tools into the agent's available tool list (whitelist; do NOT expose all 99):

- `get_token_price`
- `get_wallet_balance`
- `swap_tokens` (devnet only)
- `get_trending_tokens`
- `get_token_analytics`
- `check_token_risk`

Tool whitelist lives in agent runtime config:
```ts
const POLY_TOOLS = [
  'get_token_price', 'get_wallet_balance', 'swap_tokens',
  'get_trending_tokens', 'get_token_analytics', 'check_token_risk'
];
```

**Demo recording day 5.**

---

## Hard constraints (do not violate)

1. **Never write `.env` files.** Hooks already block this. Update `.env.example` and tell the user to copy.
2. **Never modify Kimi-owned files** — `src/server.ts`, `rate-limit.ts`, `budget-guard.ts`, `poly-agent.ts`. Hook will block. Write to `.claude/WORKLOG.md` Kimi inbox if you need a change there.
3. **Never modify the existing wizard flow.** Power users still use it. Quick-deploy is additive.
4. **Never expose the OpenRouter provisioning key in any container, log line, or HTTP response.** Compromise = bankruptcy.
5. **Never inject the user's child key into client-side code.** It stays in container env vars only.
6. **Commit prefix `[claude]`** on every commit. Hook blocks otherwise.
7. **Devnet only** for swaps during the trial. Mainnet flag is post-Friday.
8. **No force push to main.** Hook blocks. PR everything that touches more than one package.

---

## Files you will create

```
packages/openclaw-platform/src/services/openrouter-provisioner.ts        [Phase 1]
packages/openclaw-platform/src/services/telegram-pairing.ts              [Phase 3]
packages/openclaw-platform/src/db/migrations/00X_telegram_pairings.sql   [Phase 3]
```

## Files you will modify

```
packages/openclaw-agent-runtime/src/agent.ts                             [Phase 2 — full rewrite of runLoop]
packages/agent-provisioning/services/telegram-bot/src/handlers/webhook.ts [Phase 3]
packages/openclaw-platform/src/routes/agents.ts                          [Phase 4 — add endpoint, no edits to existing]
packages/openclaw-platform/src/services/docker-deployer.ts               [Phase 4 — small, add Poly defaults branch]
.env.example                                                              [add OPENROUTER_PROVISIONING_KEY, TELEGRAM_BOT_TOKEN]
```

---

## Definition of done (Friday demo)

A judge can:
1. Connect a Solana devnet wallet
2. Click "Deploy Poly" — pay X SOL
3. Tx confirms on solscan within ~15 seconds
4. Receive a Telegram deeplink
5. Click it, hit `/start`, see Poly greet them
6. Type "what's SOL price right now" → Poly replies with live price (real MCP tool call)
7. Type "swap 0.01 SOL for USDC on devnet" → Poly executes, returns devnet tx hash
8. `get_agent_status` shows the conversation logs

End-to-end under 90 seconds. Four real on-chain or verifiable moments.

---

## First message to send (template)

When you start, paste this in chat:

> I've read POLY_DEPLOYMENT_PREP_KIT.md and I'm ready to build. Before I write a line of code, I need:
> 1. OpenRouter provisioning key (or confirmation you'll set it)
> 2. Telegram bot token from BotFather
> 3. Confirmation of $5 default credit allocation for Poly tier
>
> Once I have these I'll start with Phase 1 (OpenRouter provisioner) and verify with a $0.01 test key before moving on.

---

## Open questions to flag back, NOT decide unilaterally

- Should top-up flow share the same `/quick-deploy` endpoint or be its own (`/agents/{id}/top-up`)?
- Refund policy when user cancels — full remaining balance, or minus a 10% gas fee?
- Conversation history persistence — sqlite per-agent, or central in `openclaw.sqlite`?
- Rate limiting on Telegram → agent calls (someone could spam the bot to drain credits) — Kimi territory, coordinate before adding.

Bring these to the user. Don't guess.
