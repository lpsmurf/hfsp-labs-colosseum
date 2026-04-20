# Clawdrop Deployment Flow — Improved Analysis

> **Date:** 2026-04-20  
> **Status:** Production-Ready (MCP + CLI Wizard)  
> **Server:** https://claude.clawdrop.live/sse  

---

## 1. SYSTEM OVERVIEW

Clawdrop provides **two interfaces** for deploying OpenClaw agents:

| Interface | Target User | Protocol | Entry Point |
|-----------|-------------|----------|-------------|
| **MCP Server** | Claude Code / AI clients | SSE (Server-Sent Events) | `https://claude.clawdrop.live/sse` |
| **CLI Wizard** | Human developers | Interactive CLI | `npx clawdrop-wizard` or `node wizard-docker.cjs` |

Both interfaces share the **same backend** (HFSP API) and produce **identical results** — a Docker container running OpenClaw on the tenant VPS.

---

## 2. MCP SERVER FLOW (For Claude Code / AI Clients)

### Phase 1: Discovery

```
User in Claude Code:
"Deploy an OpenClaw agent"
↓
Claude Code connects to SSE endpoint
  URL: https://claude.clawdrop.live/sse
  Protocol: SSE (text/event-stream)
↓
Claude Code receives tool manifest (16 tools)
  ├─ list_tiers
  ├─ quote_tier
  ├─ deploy_agent ← [POLLING + PAIRING enabled]
  ├─ pair_agent ← [NEW]
  ├─ get_deployment_status
  ├─ start_deployment_walkthrough ← [INTERACTIVE]
  ├─ cancel_subscription
  ├─ renew_subscription
  ├─ list_agents
  ├─ make_agent_public
  ├─ browse_registry
  ├─ get_credits / top_up_credits
  ├─ get_token_analytics
  ├─ get_market_overview
  ├─ get_wallet_analytics
  └─ check_token_risk
```

### Phase 2: Interactive Walkthrough (Recommended)

```
Claude recognizes deployment intent
↓
Calls: start_deployment_walkthrough(step: 0)
↓
MCP Server Response:
{
  "step": 0,
  "message": "🚀 Welcome to Clawdrop...",
  "tiers": [...],
  "action_required": "Call step 1 with selected_tier"
}
↓
Claude shows tiers, asks user to choose
↓
User: "Use tier_b (Dedicated)"
↓
Claude calls: start_deployment_walkthrough(
  step: 1,
  selected_tier: "tier_b",
  owner_wallet: "3TyBTe..."
)
↓
MCP Server Response:
{
  "step": 1,
  "message": "Tier 'Dedicated' selected...",
  "payment_options": ["SOL", "USDC", "HERD"],
  "action_required": "Call step 2 with selected_token"
}
↓
[Steps 2-3: Token selection → Payment detection]
↓
Step 3: Auto-detects or accepts manual tx_hash
  ├─ If auto-detect: Queries Helius API for recent tx
  └─ If manual: User provides tx signature
↓
Step 4: Deploy
  ├─ Calls deploy_agent internally
  ├─ Server polls until container is RUNNING (up to 2 min)
  ├─ Returns: status "running" (not "provisioning")
  └─ Includes Telegram pairing instructions if token provided
```

### Phase 3: Direct Deploy (Alternative)

```
Power user provides all params at once:
↓
Claude calls: deploy_agent(
  tier_id: "tier_b",
  agent_name: "MySolanaBot",
  owner_wallet: "3TyBTe...",
  payment_token: "SOL",
  payment_tx_hash: "2ybVup...",
  bundles: ["solana", "research"],
  telegram_token: "741...:AAF...",
  llm_provider: "anthropic",
  llm_api_key: "sk-ant-..."
)
↓
MCP Server:
  1. Validates payment on-chain (Helius API)
  2. Calls HFSP deploy API → creates Docker container
  3. Polls every 3s until container status = "running"
  4. Returns success with pairing instructions
↓
Response:
{
  "agent_id": "agent_12345_abc",
  "status": "running",
  "console_url": "http://127.0.0.1:45678",
  "message": "Agent running! Telegram pairing required..."
}
```

### Phase 4: Telegram Pairing

```
User messages Telegram bot → sees pairing code "4P48NNYE"
↓
Claude calls: pair_agent(
  agent_id: "agent_12345_abc",
  owner_wallet: "3TyBTe...",
  pairing_code: "4P48NNYE"
)
↓
MCP Server:
  1. Validates ownership
  2. POSTs to HFSP /agents/{id}/pair
  3. Updates agent status to "running"
  4. Logs pairing success
↓
Response:
{
  "success": true,
  "message": "Agent paired and active on Telegram"
}
```

---

## 3. CLI WIZARD FLOW (For Human Developers)

```bash
$ node wizard-docker.cjs

╔══════════════════════════════════════════════════════════╗
║           🐾 Clawdrop Docker Wizard v1.0.0               ║
╚══════════════════════════════════════════════════════════╝

🐾 Checking prerequisites...
✅ Docker installed
✅ Docker Compose installed

📋 Step 1: Select Tier
──────────────────────
1. 🌱 Explorer     $29/mo   (Shared, 1.5GB RAM)
2. 🚀 Production   $99/mo   (Dedicated, 4GB RAM)
3. 🏢 Enterprise  $499/mo  (Custom, 16GB RAM)

Select (1-3): 2

🔧 Step 2: Select Bundles
─────────────────────────
☐ 🔷 Solana    (Token analytics, wallet tools, DEX)
☐ 🔬 Research  (Web search, data analysis)
☐ 💰 Treasury  (Portfolio tracking, risk alerts)

Select bundles (comma-separated): 1,2

⚙️ Step 3: Configure Agent
─────────────────────────
Agent name: MySolanaBot
Owner wallet (Solana): 3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw
LLM Provider (anthropic/openai/openrouter): anthropic
API Key: sk-ant-api03-...
Telegram Bot Token (optional): 741...:AAF...

💳 Step 4: Payment
──────────────────
Send 0.4 SOL to: 3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw

Payment token:
  1. SOL (devnet for testing)
  2. USDC
  3. HERD
  4. Skip (demo mode)

Select (1-4): 1
Transaction signature: 2ybVup...

🚀 Step 5: Deploy
─────────────────
Calling HFSP provisioning API...
✅ Agent deployed! ID: clawdrop-mysolanabot

⏳ Step 6: Wait for Ready
─────────────────────────
Polling container status... starting
[3s] status: starting
[6s] status: starting
[9s] status: running ✅

📱 Step 7: Telegram Pairing (if token provided)
───────────────────────────────────────────────
1. Find your bot on Telegram
2. Send /start
3. Enter pairing code: 4P48NNYE

✅ Pairing successful! Agent active on Telegram.

🎉 Your OpenClaw agent is live!
   Endpoint: http://127.0.0.1:45678
   Tenant VPS: 187.124.173.69
```

---

## 4. ERROR HANDLING & EDGE CASES

### Payment Verification Failed

```
User provides invalid tx signature
↓
MCP Server:
  ├─ Queries Helius API → tx not found
  ├─ OR queries Solana RPC → no SOL transfer to wallet
  └─ Returns: { verified: false, error: "..." }
↓
Claude asks user to:
  1. Verify transaction on Solscan
  2. Check correct network (devnet vs mainnet)
  3. Resend payment and provide new tx hash
```

### Container Fails to Start

```
HFSP deploy succeeds but container exits
↓
Polling detects status: "error" or "stopped"
↓
MCP Server:
  ├─ Returns status: "failed"
  ├─ Includes error message from container logs
  └─ Suggests checking logs via get_deployment_status
↓
User can:
  ├─ Check logs: get_deployment_status(agent_id, wallet)
  ├─ Retry deploy (same tx hash accepted within 5 min)
  └─ Contact support with agent_id
```

### Port Conflict

```
HFSP API auto-detects next available port
↓
If port in use:
  ├─ Wizard: suggests alternative, asks user
  └─ MCP: automatically increments until free
↓
No manual port selection needed in most cases
```

### Telegram Pairing Timeout

```
User doesn't pair within session
↓
Agent stays in "awaiting_pairing" status
↓
User can later call pair_agent anytime
  (agent_id never expires, code rotates every 24h)
```

---

## 5. DATA FLOW DIAGRAM

```
┌─────────────┐     SSE/SSE     ┌──────────────────┐
│ Claude Code │◄───────────────►│  MCP Server      │
│  (Client)   │                 │  (Port 3000)     │
└─────────────┘                 └────────┬─────────┘
                                         │
                                         │ HTTP POST
                                         │ Bearer Token
                                         ▼
                                ┌──────────────────┐
                                │   HFSP API       │
                                │   (Port 3001)    │
                                │                  │
                                │ ┌──────────────┐ │
                                │ │ Provisioning │ │
                                │ │   Engine     │ │
                                │ └──────┬───────┘ │
                                └────────┼─────────┘
                                         │ SSH + Docker
                                         ▼
                                ┌──────────────────┐
                                │   Tenant VPS     │
                                │ 187.124.173.69  │
                                │                  │
                                │ ┌──────────────┐ │
                                │ │ Docker       │ │
                                │ │ Container    │ │
                                │ │ (OpenClaw)   │ │
                                │ └──────────────┘ │
                                └──────────────────┘
```

---

## 6. ENVIRONMENT REQUIREMENTS

### MCP Server (claude.clawdrop.live)

```bash
# Required
HELIUS_API_KEY=xxx              # Payment verification
CLAWDROP_WALLET_ADDRESS=xxx   # Payment recipient
HFSP_API_KEY=xxx              # Provisioning auth

# Optional
BIRDEYE_API_KEY=xxx           # Token analytics
DD_XYZ_API_KEY=xxx            # Risk checks
```

### CLI Wizard (Local Machine)

```bash
# Required
HFSP_API_KEY=xxx              # Same as above
HFSP_URL=http://localhost:3001  # Or remote

# Optional (for local Docker builds)
DOCKER_HOST=unix:///var/run/docker.sock
```

---

## 7. API COMPARISON: MCP vs CLI

| Feature | MCP Server | CLI Wizard |
|---------|-----------|------------|
| **Target** | AI assistants | Human developers |
| **Protocol** | SSE (HTTP) | Interactive TTY |
| **Polling** | ✅ Built-in (2 min max) | ✅ Built-in (interactive) |
| **Pairing** | ✅ `pair_agent` tool | ✅ Interactive prompt |
| **Payment Verify** | ✅ Helius API | ✅ Helius API |
| **Error Recovery** | Claude handles retry | Wizard loops/reprompts |
| **Bulk Deploy** | ✅ Scriptable | ❌ One at a time |
| **Logs Access** | `get_deployment_status` | Direct Docker commands |

---

## 8. QUICK REFERENCE

### MCP Tool Call Examples

```javascript
// List tiers
{ name: "list_tiers", arguments: {} }

// Deploy with all options
{ name: "deploy_agent", arguments: {
  tier_id: "tier_b",
  agent_name: "MyBot",
  owner_wallet: "3TyBTe...",
  payment_token: "SOL",
  payment_tx_hash: "2ybVup...",
  bundles: ["solana", "research"],
  telegram_token: "741...:AAF...",
  llm_provider: "anthropic",
  llm_api_key: "sk-ant-..."
}}

// Check status
{ name: "get_deployment_status", arguments: {
  agent_id: "agent_12345_abc",
  owner_wallet: "3TyBTe..."
}}

// Pair Telegram
{ name: "pair_agent", arguments: {
  agent_id: "agent_12345_abc",
  owner_wallet: "3TyBTe...",
  pairing_code: "4P48NNYE"
}}
```

### CLI Wizard Commands

```bash
# Deploy
node wizard-docker.cjs

# Check container on tenant VPS
ssh root@187.124.173.69 "docker ps | grep hfsp_"

# View logs
ssh root@187.124.173.69 "docker logs hfsp_<agent-id>"

# Restart
ssh root@187.124.173.69 "docker restart hfsp_<agent-id>"

# Remove
ssh root@187.124.173.69 "docker rm -f hfsp_<agent-id>"
```

---

## 9. TROUBLESHOOTING

| Problem | Cause | Fix |
|---------|-------|-----|
| Claude Code sees no tools | Running old server | Restart with `sudo kill -9 <pid>` |
| "Payment not found" | Tx on wrong network | Use devnet Helius for devnet tx |
| Container stuck "starting" | Out of memory | Upgrade tier or check logs |
| Pairing fails | Wrong code or timeout | Get new code from Telegram bot |
| Port already in use | Multiple agents | Auto-detects next port |
| MCP connection drops | Timeout (30s default) | Use `proxy_read_timeout 86400` in nginx |

---

## 10. DEPLOYMENT CHECKLIST

- [ ] MCP server running on port 3000
- [ ] nginx reverse proxy with SSL
- [ ] Environment variables set (`.env`)
- [ ] HFSP API running on port 3001
- [ ] Tenant VPS accessible via SSH
- [ ] Docker image built: `hfsp-tenant-runtime`
- [ ] Test deploy via CLI wizard
- [ ] Test deploy via MCP (Claude Code)
- [ ] Verify Telegram pairing works
- [ ] Check payment verification on devnet
- [ ] Confirm logs accessible

---

*Last updated: 2026-04-20 by Luis Ploennig (Kimi)*
