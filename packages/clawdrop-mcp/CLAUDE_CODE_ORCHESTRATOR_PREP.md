# Claude Code Orchestrator: Friday Demo Execution Plan

## Vision
Claude Code becomes the **sales + provisioning interface** for Clawdrop. A stakeholder can:

1. Open Claude Code
2. Connect to Clawdrop MCP
3. Say: "Deploy me a Treasury Agent Pro with research-to-execution capabilities"
4. Watch as MCP tools orchestrate the entire flow in real-time
5. Get back a ready-to-use OpenClaw endpoint + credentials

---

## Architecture for Friday

### Setup
```
Claude Code (Friday Demo)
    │
    ├─→ [Clawdrop MCP] (this repo)
    │    │
    │    ├─ list_services (✅ ready)
    │    ├─ quote_service (✅ ready)
    │    ├─ pay_with_sol (⚠️ needs real signing)
    │    ├─ create_openclaw_agent (❌ needs Docker)
    │    └─ get_agent_status (⚠️ needs real Docker)
    │
    └─→ [Devnet Solana] (via Helius)
         ├─ Payment confirmation
         └─ Transaction tracking
```

### Alternative for Friday: "Dry Run" → "Live"
If Docker orchestration isn't ready, we can run two demos:

**Demo 1 (Dry Run)**: Payment flow
- Show `list_services` → `quote_service` → `pay_with_sol`
- Real Solana tx signed and broadcast to devnet
- Confirm payment on Solana devnet explorer
- Agent status shows "provisioning"

**Demo 2 (Simulation)**: Docker deployment
- Show `create_openclaw_agent` with realistic output
- Simulate Docker spinup (use `docker ps` to show real container)
- Show capability bundle installation logs
- Final status: "ready"

This way, every step is either **real** (Solana payment) or **real-looking** (actual Docker container).

---

## Build Order for Fastest Path

### Immediate (Today - ~6 hours)
1. **Real Solana Signing in `pay_with_sol`**
   - Use `@solana/web3.js` for transaction construction
   - Use CLI signer or Phantom RPC (if available)
   - Return real devnet signature + tx hash
   - Store transaction record in memory store
   - **Why**: This is the most impressive visual—real on-chain confirmation

2. **Capability Bundle Registry Stub**
   - Create `src/capabilities/registry.ts`
   - Define bundle metadata (name, version, MCPs included, size)
   - Preload 3 bundles: `treasury_ops`, `research_execution`, `wallet_management`
   - Endpoint: `getCapabilityBundle(bundleName: string): Bundle`
   - **Why**: Enables realistic Docker init scripts in deployment

### Short-term (Today → Friday morning, ~12 hours)
3. **Docker Orchestration Engine**
   - Create `src/deployment/docker-orchestrator.ts`
   - Use `dockerode` Node.js library
   - Functions:
     - `spinContainer(deploymentId: string, bundleNames: string[]): Promise<ContainerInfo>`
     - `waitForHealthy(containerId: string, timeoutMs: number): Promise<boolean>`
     - `generateEndpoint(containerId: string): string`
   - Start with minimal `clawdrop/openclaw:latest` image
   - **Why**: Enables real container spinning for demo

4. **Wire Docker into `create_openclaw_agent` Tool**
   - Replace mock function with real Docker call
   - Return status "deploying" immediately
   - Poll Docker health in background
   - Auto-update agent status to "ready" when healthy
   - **Why**: Completes the gold path with real infrastructure

5. **Enhanced `get_agent_status` for Docker Stats**
   - Query Docker API for container metrics
   - Return: CPU usage, memory, uptime, ports exposed
   - Include last 10 logs from container stdout
   - **Why**: Demonstrates operational visibility

---

## Friday Demo Script (Real + Simulation Mix)

### Phase 1: Discovery & Quoting (100% Real)
```typescript
// USER: "Show me what tiers you have"
claude_request("list_services")
// OUTPUT: 5 tiers with pricing

// USER: "Quote me the Treasury Agent Pro with research bundle"
claude_request("quote_service", {
  service: "Treasury Agent Pro",
  bundle: "research_execution"
})
// OUTPUT: 150 SOL + 0.005 gas, 30-day term
```

### Phase 2: Payment (100% Real)
```typescript
// USER: "I'll take it. Charge my wallet."
claude_request("pay_with_sol", {
  service_id: "treasury_pro",
  bundle_names: ["research_execution"],
  amount_usd: 450,
  wallet_address: "7qj..." // Stakeholder's devnet wallet
})
// REAL: Sign tx → broadcast to devnet → confirm
// OUTPUT: {
//   "tx_hash": "4aB...",
//   "confirmed": true,
//   "explorer_url": "https://solscan.io/tx/4aB...",
//   "status": "payment_complete"
// }
```

### Phase 3: Deployment (Real Infrastructure)
```typescript
// USER: "Deploy my agent"
claude_request("create_openclaw_agent", {
  deployment_name: "demo_treasury_pro",
  bundles: ["research_execution"],
  tier: "pro"
})
// REAL: Docker container spins
// OUTPUT: {
//   "agent_id": "ocl_demo123",
//   "status": "deploying",
//   "deployment_started_at": "2026-04-18T14:30:00Z"
// }

// (30 seconds of real Docker initialization)

// USER: "Check status"
claude_request("get_agent_status", {
  agent_id": "ocl_demo123"
})
// REAL: Docker stats + logs
// OUTPUT: {
//   "agent_id": "ocl_demo123",
//   "status": "ready",
//   "api_endpoint": "http://localhost:8001",
//   "deployed_capabilities": ["research_execution"],
//   "container_stats": {
//     "cpu_percent": "2.1%",
//     "memory_mb": "145",
//     "uptime_seconds": 35
//   },
//   "recent_logs": [
//     "INFO: Bundle research_execution loaded",
//     "INFO: MCP server listening on port 8001",
//     "INFO: Health check passed"
//   ]
// }
```

### Phase 4: Handoff (Real Endpoint)
```typescript
// USER: "I'm ready to use it. What's my connection string?"
// OUTPUT:
// ✅ Treasury Agent Pro deployed
// 📊 Research-to-Execution capability active
// 🌐 Live endpoint: http://localhost:8001
// 🔑 Auth token: sk_live_demo...
// 📋 Solana tx: https://solscan.io/tx/4aB...
// ⏱️  Deployment time: 35 seconds
```

---

## Files to Create/Modify

### New Files
```
src/deployment/
├── docker-orchestrator.ts  (Docker SDK + container mgmt)
├── bundle-installer.ts     (Capability bundle extraction)
└── deployment-config.ts    (Docker image paths, ports, etc.)

src/capabilities/
├── registry.ts             (Bundle metadata + loader)
└── bundles/
    ├── treasury_ops.json
    ├── research_execution.json
    └── wallet_management.json

scripts/
└── demo-friday.ts          (Complete 4-phase demo)
```

### Modify Existing
```
src/server/tools.ts
  └─ create_openclaw_agent: Replace mock with Docker call
  └─ get_agent_status: Add Docker stats + logs

src/integrations/helius.ts
  └─ Add simulateDevnetTransaction() for realistic tx hashes

src/db/memory.ts
  └─ Add containerInfo field to DeployedAgent
  └─ Add txHash field for payment tracking

package.json
  └─ Add: dockerode, @solana/web3.js (if not present)
```

---

## Prerequisite Checks for Friday

```bash
# 1. Solana CLI installed (for tx signing)
solana --version

# 2. Docker daemon running
docker ps

# 3. Helius API key set
echo $HELIUS_API_KEY

# 4. Node.js 20+
node --version

# 5. Clawdrop repo compiled
npm run build

# 6. MCP server starts cleanly
npm run dev
```

---

## Risk Mitigation

### If Docker isn't ready by Friday morning:
- Use pre-built Docker container (pull + run only, no orchestration)
- Simulate spinup time with `await delay(3000)`
- Show real container with `docker ps` output
- Focus demo on payment flow (100% real) + container readiness check

### If Solana signing fails:
- Fall back to Helius "sponsored transactions" if available
- Use pre-signed transaction (sign offline, broadcast in demo)
- Show transaction on devnet explorer (real settlement)

### If Helius API is down:
- Mock price feed with realistic values ($0.15 SOL)
- All payment logic still works
- Focus on provisioning flow

---

## Success Metrics for Friday

✅ **Payment**: Real SOL signed → confirmed on devnet in < 10 seconds
✅ **Deployment**: Docker container spins, status shows "deploying"
✅ **Capability**: At least one bundle (treasury_ops) installs
✅ **Handoff**: Final status shows "ready" + API endpoint
✅ **End-to-end time**: < 2 minutes from "Deploy me" to "ready"

---

## MCP Tool Flow During Demo

```
user input (Claude Code)
    │
    ├─→ list_services
    │    └─ services.json → Service[]
    │
    ├─→ quote_service
    │    └─ pricing engine → Quote + gas
    │
    ├─→ pay_with_sol
    │    ├─ @solana/web3.js
    │    ├─ Sign + broadcast
    │    ├─ Helius confirmation
    │    └─ Store in memory.ts
    │
    ├─→ create_openclaw_agent
    │    ├─ docker-orchestrator.spin()
    │    ├─ bundle-installer.load()
    │    ├─ Set status "deploying"
    │    └─ Update in memory.ts
    │
    └─→ get_agent_status (polling)
         ├─ Query Docker API
         ├─ Get container stats
         ├─ Fetch logs
         └─ Return status "ready"

Claude Code displays entire flow in chat
  with real explorer links, endpoint URLs, and Docker stats
```

---

## Deployment Post-Friday

### Week 1 (After demo):
1. Move Docker volumes to persistent storage
2. Add PostgreSQL for agent state persistence
3. Implement real capability bundle signing + verification
4. Add customer auth (API keys + JWT)

### Week 2:
1. Multi-container orchestration (Docker Compose per agent)
2. Load balancing (HAProxy or Caddy reverse proxy)
3. Real-time monitoring dashboard (Prometheus + Grafana)
4. Backup + restore workflows

### Week 3:
1. Mainnet payment support
2. Multi-region deployment (AWS/GCP regions)
3. Automated scaling (Kubernetes or Docker Swarm)
4. Full customer dashboard (Claw Console)

---

## Ownership

**Kimi (Track B)**: HFSP integration + real Solana signing for `pay_with_sol`
**You (Track C)**: Docker orchestration + capability registry + `create_openclaw_agent` implementation

**Both**: Test complete flow Friday morning before demo.
