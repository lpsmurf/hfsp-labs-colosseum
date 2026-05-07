# Clawdrop MCP: Control Plane Restructuring

## Architecture Shift

### Before (Current)
```
Clawdrop MCP → Sold to user → User uses MCP directly as runtime agent
               (End-user facing agent)
```

### After (New Model)
```
Clawdrop MCP (Control Plane)
├── Sales/Discovery (list_services, quote_service)
├── Payment Engine (pay_with_sol)
├── Orchestration (create_openclaw_agent, monitor deployments)
└── Provisioning (Docker deployment, capability bundle installation)
        ↓
   [Deployed OpenClaw Instance] ← Customer's actual runtime
        ├── Integrated MCPs (Extensions)
        ├── Named capability bundles
        └── Customer-facing operational interface
```

## Three Layers

### Layer 1: Clawdrop MCP (This Repo - Control Plane)
**Purpose**: Discover, quote, sell, provision, orchestrate

**Responsibilities**:
- List available service tiers
- Quote pricing in SOL/HERD
- Accept payment (Solana devnet → mainnet progression)
- Create/manage OpenClaw deployments
- Install capability bundles into deployed instances
- Monitor and manage customer runtimes

**Tools** (5 core):
1. `list_services` → tier discovery
2. `quote_service` → pricing with payment method
3. `pay_with_sol` → accept payment (HFSP integration for provisioning)
4. `create_openclaw_agent` → provision Docker instance + init
5. `get_agent_status` → deployment status + customer runtime health

**Output**: Deployment credentials, API endpoint, MCP connection string for customer

---

### Layer 2: Deployed OpenClaw Instance (Customer Facing)
**Purpose**: Customer's actual runtime - what they use day-to-day

**Deployment Model**:
- Docker container on Clawdrop server (or customer's infra)
- Spawned by `create_openclaw_agent` tool in Layer 1
- Unique API endpoint per customer
- MCP-based extension interface

**Responsibilities**:
- Runs customer's operational workflows
- Exposes MCP interface for Claude/agents
- Manages named capability bundles
- Persists state (via PostgreSQL)
- Logs all executions

---

### Layer 3: Capabilities (Extensions/MCPs inside OpenClaw)
**Purpose**: Pluggable operational abilities

**Bundle Types**:
- Treasury operations (SOL transfers, swaps, analysis)
- Research-to-execution (market data → trading signals)
- Wallet management (keys, security, multi-sig)
- Finance ops (reconciliation, reporting)
- Custom extensions (customer-defined MCPs)

**Installation**: Capability bundles are pulled from registry and installed into customer's OpenClaw at provisioning time.

---

## Gold-Path Flow (One Real Transaction)

```
1. USER DISCOVERY
   └─ list_services
      └─ Show 4-5 tiers ($10/mo → $500/mo)

2. PRICING & SELECTION
   └─ quote_service
      └─ "Treasury Agent Pro" = 150 SOL + 0.005 SOL gas
      └─ 30-day term, 1 capability bundle

3. PAYMENT VERIFICATION
   └─ pay_with_sol
      └─ Sign tx with wallet
      └─ Broadcast to devnet
      └─ Confirm on-chain (Helius API)
      └─ Return payment receipt

4. DOCKER DEPLOYMENT
   └─ create_openclaw_agent
      ├─ Spin Docker container (clawdrop/openclaw:latest)
      ├─ Initialize with deployment ID
      ├─ Create .env with auth token
      ├─ Start service (expose on port 8000)
      └─ Return status "deploying"

5. CAPABILITY INSTALLATION
   └─ [Inside Docker init]
      ├─ Fetch named bundle from registry
      ├─ Extract MCPs (treasury, research-to-execution)
      ├─ Install into OpenClaw extensions/
      ├─ Run tests
      └─ Status → "ready"

6. HANDOFF TO CUSTOMER
   └─ get_agent_status
      ├─ Confirm status = "ready"
      └─ Return:
         {
           "agent_id": "ocl_xyz...",
           "api_endpoint": "https://clawdrop.com/agents/ocl_xyz/",
           "mcp_connection": "stdio://localhost:8001",
           "deployed_capabilities": ["treasury_ops", "research_exec"],
           "auth_token": "sk_live_...",
           "status": "ready",
           "created_at": "2026-04-15T14:30:00Z"
         }
```

---

## Current Gaps vs Gold Path

| Step | Current State | Gap | Priority |
|------|---------------|-----|----------|
| 1. list_services | ✅ Working | None | — |
| 2. quote_service | ✅ Working | None | — |
| 3. pay_with_sol | ⚠️ Mock payment | Real Solana tx signing + broadcast | **P0** |
| 4. Docker deployment | ❌ No-op | Build deployment engine + Docker config | **P0** |
| 5. Capability install | ❌ No-op | Build registry + bundle installer | **P1** |
| 6. Handoff | ✅ Schema ready | Real endpoint generation | **P1** |

---

## Technology Stack for Layer 2 (OpenClaw Deployment)

### Docker Image
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY openclaw-runtime ./
RUN npm install
ENV MCP_STDIO_TRANSPORT=true
ENV AUTH_TOKEN=${AUTH_TOKEN}
EXPOSE 8000
CMD ["npm", "start"]
```

### OpenClaw Runtime (New Repo)
- TypeScript MCP server (like this one, but running inside Docker)
- Reads capability bundles from `/app/extensions/`
- Exposes HTTP REST API on `:8000`
- Persists state to PostgreSQL (passed via `DATABASE_URL`)
- Logs to CloudWatch/Datadog (passed via `LOGGING_ENDPOINT`)

### Capability Bundle Format
```
treasury_ops-v1.0.0/
├── package.json
├── dist/
│   └── index.js (MCP tool definitions)
├── manifest.json (metadata)
└── README.md
```

---

## Success Criteria for Friday Demo

1. **Payment flow end-to-end**: SOL signed + broadcast to devnet, receipt on-chain visible
2. **Docker container spins up**: Real container with unique port/endpoint
3. **One capability bundle installs**: Treasury ops bundle loads and is callable
4. **Customer gets API endpoint**: Real endpoint they can curl or connect to
5. **Status tracking works**: get_agent_status shows real Docker stats (CPU, memory, uptime)

---

## Fastest Path to Real Deployment

### Phase 1: Payment → Provisioning (This week)
1. Wire real Solana tx signing in `pay_with_sol` (Phantom wallet or CLI signer)
2. Build minimal Docker orchestration in `create_openclaw_agent`
   - Use Docker SDK (Node.js) to spin container
   - Mount volumes for auth tokens
   - Track container ID in agent store
3. Build capability bundle registry endpoint
4. Test full flow locally

### Phase 2: Day-2 Ops (Next week)
1. PostgreSQL persistence for customer data
2. CloudWatch logging + monitoring
3. Multi-region deployment strategy
4. Customer auth/API key management

---

## Handoff Strategy

**Track B (Kimi)**: HFSP API integration + real Solana signing
**Track C (You, continuing)**: Docker orchestration + capability registry

Both needed for Friday demo.
