# Clawdrop Architecture

## The Two-Stage Model

**Stage 1: Free Trial**
- Entry point: `clawdrop.live/try`
- Tech: React frontend + Mastra agent + SendAI Agent Kit
- Scope: Read-only access to 20+ Solana tools (token data, wallet inspection)
- Infrastructure: Shared trial-api service
- RPC: Devnet (no real transactions)

**Stage 2: Deployed Agent**
- Entry point: Telegram, web dashboard
- Tech: Per-user Docker containers (MCP server + agent runtime)
- Scope: Full capabilities (swaps, transfers, DeFi interactions)
- Infrastructure: Isolated per subscriber
- RPC: Mainnet (real transactions, real Solana keys)

The free trial is the proof; deployment is the product.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1: TRIAL                                                      │
│                                                                     │
│  User Browser                                                       │
│       ↓                                                             │
│   trial-frontend (React/Vite)                                      │
│       ↓                                                             │
│   trial-api (port 8787)                                           │
│       ├─ Mastra agent orchestration                                │
│       ├─ SolanaAgentKit(TokenPlugin + MiscPlugin)                  │
│       └─ Wallet adapter (Phantom, Solflare)                        │
│       ↓                                                             │
│   Helius RPC (devnet)                                              │
│   - Token prices (Jupiter)                                         │
│   - Wallet data                                                    │
│   - NFT metadata                                                   │
│   - Rug detection                                                  │
└─────────────────────────────────────────────────────────────────────┘

                              (Free tier → Paid tier)

┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: DEPLOYED AGENTS (Per-User Containers)                      │
│                                                                     │
│  User via Telegram                                                  │
│       ↓                                                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Docker Container (zk-agent-{agentId})                      │    │
│  │                                                             │    │
│  │  clawdrop-agent-runtime                                    │    │
│  │  ├─ Telegram webhook listener (Grammy)                     │    │
│  │  ├─ MCP client connection                                  │    │
│  │  └─ Guardrails pipeline (9 hooks)                          │    │
│  │       ↓                                                     │    │
│  │  clawdrop-mcp-server (localhost:3002)                      │    │
│  │  ├─ SolanaAgentKit(TokenPlugin + DefiPlugin)               │    │
│  │  ├─ x402engine-mcp (payment tools)                         │    │
│  │  ├─ Custom Clawdrop tools                                  │    │
│  │  │   ├─ list_tiers                                          │    │
│  │  │   ├─ get_wallet_analytics                                │    │
│  │  │   ├─ get_token_analytics                                 │    │
│  │  │   ├─ check_token_risk                                    │    │
│  │  │   └─ get_market_overview                                 │    │
│  │  └─ MCP Server (HTTP Streamable transport)                  │    │
│  │       ↓                                                     │    │
│  │  Solana Private Key (AES-GCM encrypted, injected at spawn)  │    │
│  └────────────────────────────────────────────────────────────┘    │
│       ↓                                                             │
│  Helius RPC (mainnet)                                              │
│  - Swap execution (Jupiter)                                        │
│  - Token transfers                                                 │
│  - DeFi interactions                                               │
│  - Portfolio monitoring                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Manager Layer (clawdrop-platform):
  ├─ Subscription management
  ├─ Payment processing
  ├─ Docker API → container spawn/destroy
  ├─ LLM router (OpenRouter, BYOK, custom)
  ├─ ZK credential vault
  └─ Webhook for Telegram pairing
```

---

## Per-User Isolation Model

Each deployed agent has three layers of isolation:

### 1. Container Isolation (Docker)
- Each subscriber: named container `zk-agent-{agentId}`
- Resources: CPU limits, memory limits, network namespace
- Lifespan: Spawned on demand, destroyed on unsubscribe

### 2. Key Encryption (AES-GCM)
- Stored: `{ encryptedBlob, nonce, salt }` in clawdrop-platform database
- Decryption requires: `VAULT_ENCRYPTION_KEY` env var (32+ chars)
- Lifetime: Decrypted only at container spawn, immediately revoked from credential broker
- Access: If server is compromised without the env var, encrypted blobs are useless

### 3. Network Isolation
- MCP server: localhost-only, reachable only by agent runtime in same container
- RPC calls: Signed transactions, no key exposed in HTTP requests
- Telegram webhook: Per-agent token, rate-limited by platform

**Result:** Compromise of one user's container does not leak other users' keys.

---

## SendAI Agent Kit Integration Points

### Trial Path (Stage 1)
- **Entry:** `trial-api/src/services/solana-agent.ts`
- **Instantiation:** `new SolanaAgentKit(keyPair, RPC_URL, { llmClient })`
- **Plugins:** TokenPlugin (token data), MiscPlugin (wallet, domains, NFTs)
- **Tool Usage:** Read-only queries only; `swapTokens`, `transferToken` are not exposed to users
- **LLM:** Anthropic Claude (via Mastra)
- **Scope:** 20+ tools available to agent reasoning

### Deployed Path (Stage 2)
- **Entry:** `clawdrop-mcp-server/src/server.ts`
- **Instantiation:** Same as trial, but with user's wallet
- **Plugins:** TokenPlugin + DefiPlugin (full capabilities)
- **MCP Exposure:** Via `@solana-agent-kit/adapter-mcp`
- **Tool Extension:** Custom Clawdrop tools registered in `actionsRecord`
- **LLM Router:** OpenRouter, BYOK, custom endpoint (per user)
- **Scope:** 60+ tools available to agent reasoning

---

## MCP Tool Surface Per User

When a user's agent connects to their MCP server, the tool surface includes:

```
CATEGORY                  TOOLS
────────────────────────────────────────────
SendAI TokenPlugin        get_token_data, get_token_price, create_token, 
                          update_token_metadata, transfer_token, get_balance,
                          get_token_by_mint, ...
                          
SendAI DefiPlugin         swap_tokens, get_liquidity_pools, get_swap_routes,
                          get_price_impact, farm_tokens, unfarm_tokens,
                          yield_farm, get_raydium_positions, ...
                          
x402engine-mcp            payment_initiate, payment_verify, get_balance,
                          refund_payment, ...
                          
Clawdrop Custom           list_tiers, get_token_analytics, get_wallet_analytics,
                          check_token_risk, get_market_overview
```

Total: 60+ Agent Kit tools + 5 x402 tools + 5 Clawdrop tools = **70+ tools per MCP server**.

---

## LLM Router

User's choice of LLM is managed by `clawdrop-platform/src/services/llm-router.ts`:

1. **Mode 1: Platform-managed keys**
   - Clawdrop stores OpenRouter API key
   - User gets access to all OpenRouter models
   - Monthly token budget reset

2. **Mode 2: Bring Your Own Key (BYOK)**
   - User provides their OpenAI / Anthropic / custom API key
   - Clawdrop stores it AES-encrypted
   - User pays the LLM provider directly
   - Clawdrop base fee still applies

3. **Mode 3: Custom Endpoint**
   - User specifies a self-hosted LLM endpoint (Ollama, Hugging Face, etc.)
   - Zero LLM cost to user
   - Clawdrop base fee still applies

The tool layer (Agent Kit + x402 + custom tools) remains unchanged regardless of LLM choice.

---

## Guardrails Pipeline

Every MCP request from the agent runtime to the MCP server passes through **9 hooks**:

1. **Input validation** — Zod schema enforcement
2. **Rate limiting** — Per-user RPM limits
3. **Auth guard** — Verify agent owns this MCP server
4. **Tool allowlist** — Agent can't call admin tools
5. **Swap guard** — Verify swap slippage is acceptable
6. **Execution timeout** — Prevent infinite loops (30s default)
7. **Output sanitizer** — Remove sensitive data from LLM response
8. **Credit guard** — Verify user has budget remaining
9. **Logging** — Immutable audit trail

If any hook fails, the request is rejected and the agent is notified.

---

## Summary

Clawdrop is a three-tier system:

| Tier | Component | Scope |
|------|-----------|-------|
| **User** | Telegram bot or web UI | Conversational interface |
| **Agent** | Docker container + agent runtime | LLM reasoning, orchestration |
| **Tools** | MCP server + SendAI Agent Kit | Solana transactions, queries |

The key innovation is **agent Kit as a tool server, not as an agent loop**, allowing LLM flexibility, per-user isolation, and unified payment-aware tool selection.

