# AUDIT: Clawdrop MCP Repository State vs. Orchestrator Prep Kit

**Date**: April 15, 2026
**Status**: Mid-way through architectural transition
**Verdict**: **70% toward control plane, 30% still demo-oriented**

---

# EXECUTIVE SUMMARY

## ✅ What's Built (Strengths)

| Component | Status | Details |
|-----------|--------|---------|
| **Core MCP Server** | ✅ Working | Stdio transport, tool registration, error handling |
| **5 MCP Tools** | ✅ Functional | list_services, quote_service, pay_with_sol, create_openclaw_agent, get_agent_status |
| **Service Catalog** | ✅ JSON-driven | 10 services in 4 categories with SOL/HERD pricing |
| **Pricing Engine** | ✅ Real Helius Integration | Real SOL/HERD price fetching with fallback mocks |
| **In-Memory Agent Store** | ✅ Functional | Agents persist across tool calls (Map-based) |
| **Logging** | ✅ Production-ready | Pino logger with color output, configurable levels |
| **Demo Scripts** | ✅ Working | quick-test, monitor, demo-advanced show full flow |
| **TypeScript + Zod** | ✅ Type-safe | Strict mode, runtime validation on all tools |
| **Documentation** | ⚠️ Mixed | RESTRUCTURING_PLAN.md + CLAUDE_CODE_ORCHESTRATOR_PREP.md excellent, old docs lag |

---

## 🔴 What's Missing (Gaps vs Orchestrator Prep Kit)

| Requirement | Current | Gap | Severity |
|-------------|---------|-----|----------|
| **Tier Catalog** | Services.json (generic) | Tiers with runtime_preset, capability_bundle, regions | **P0** |
| **Deployment Model** | Agent store only | Full Deployment records with status, endpoint, payment_id | **P0** |
| **Payment State Machine** | Boolean approve flag | Real quote → checkout → verify → settled flow | **P0** |
| **Provisioner Contract** | None | Explicit DeployRequest/DeployResponse interface | **P0** |
| **Docker Orchestration** | Stubbed | Real container spinning via dockerode or SSH | **P0** |
| **Capability Bundles** | Hardcoded in tool | Named, versioned bundles (travel-crypto-pro, etc.) | **P1** |
| **Multi-Tenancy Data Models** | None | Customer, Deployment, Payment DB records | **P1** |
| **Persistent Storage** | In-memory only | PostgreSQL or abstracted storage interface | **P1** |
| **Provisioner Backend** | Unknown | Decision needed: HFSP? SSH+Docker? Custom? | **P0** |
| **Regional Strategy** | None | Regions catalog + server selection logic | **P1** |
| **Checkout Tool** | Missing | create_checkout not implemented | **P0** |
| **Verify Payment Tool** | Stubbed | verify_payment has no real on-chain verification | **P0** |
| **Deploy Instance Tool** | Stubbed | deploy_openclaw_instance needs Docker integration | **P0** |
| **Capability Installation** | None | MCP bundle installer logic missing | **P1** |
| **Health Checks** | None | Deployment status polling + health verification | **P1** |
| **Reference Docs** | Partial | deployment-contract.md, capability-bundles.md, payment-state-machine.md needed | **P1** |

---

# DETAILED ANALYSIS

## 1. Tools: Naming vs. Purpose Mismatch

### Current Tools (Demo-oriented)
```
list_services        ← Generic service discovery
quote_service        ← Single-purpose quoting
pay_with_sol         ← Simplified payment
create_openclaw_agent ← Unclear ownership
get_agent_status     ← Agent-centric, not deployment-centric
```

### Orchestrator Prep Kit Vision (Control Plane)
```
list_tiers                        ← Tier discovery
get_tier_details                  ← Tier metadata
list_regions                      ← Regional availability
quote_tier                        ← Tier quoting
create_checkout                   ← MISSING
verify_payment                    ← STUBBED (no real verification)
deploy_openclaw_instance          ← Renamed, needs Docker
get_deployment_status             ← MISSING
get_instance_connection_info      ← MISSING
upgrade_instance / pause / resume ← MISSING
```

### Verdict
**Gap**: 5/12 tools don't exist. 3/5 existing tools have wrong names. Requires rename + 7 new tools.

---

## 2. Data Models: Services vs. Tiers

### Current: Service Catalog (Generic)
```json
{
  "id": "treasury-agent",
  "name": "Treasury Agent",
  "description": "...",
  "category": "treasury",
  "price_sol": 5.0,
  "price_herd": 500.0,
  "deployment_type": "openclaw"
}
```

### Needed: Tier Catalog (Product-aware)
```json
{
  "id": "travel-pro",
  "name": "Travel Pro",
  "description": "...",
  "price_usd": 299,
  "runtime_preset": "medium",      ← Missing
  "capability_bundle": "travel-crypto-pro",  ← Missing
  "supported_regions": ["us-east", "eu-west"],  ← Missing
  "payment_tokens": ["SOL", "HERD"],
  "default_policy": {...},         ← Missing
  "monthly_memory_mb": 1024,        ← Missing
  "monthly_storage_gb": 10          ← Missing
}
```

### Missing Data Models Entirely
```typescript
// NOT IN REPO
interface Deployment {
  id: string;
  tier_id: string;
  customer_id: string;
  payment_id: string;
  status: 'provisioning' | 'ready' | 'failed';
  endpoint: string;
  runtime_instance_id: string;
  created_at: Date;
}

interface Payment {
  id: string;
  customer_id: string;
  tier_id: string;
  amount_sol: number;
  token: 'SOL' | 'HERD';
  status: 'quoted' | 'pending' | 'confirmed' | 'failed' | 'expired';
  tx_hash: string;
  verified_at?: Date;
}

interface Customer {
  id: string;
  wallet_address: string;
  created_at: Date;
}

interface Region {
  id: string;
  name: string;
  server_capacity: number;
  current_deployments: number;
}
```

### Verdict
**Gap**: No explicit deployment/payment/customer/region models. In-memory agent store is insufficient.

---

## 3. Payment Flow: Boolean Flag vs. State Machine

### Current Implementation
```typescript
// In pay_with_sol tool
if (!req.approve) {
  throw new Error('Payment not approved');
}

// Then immediately returns success:
{
  tx_hash: 'mock_...',
  confirmed: true,
  amount_sol: 150
}
```

### Needed: Real State Machine
```
quote_created
  ↓ [time + verification]
checkout_pending
  ↓ [customer signs tx]
payment_pending
  ↓ [Helius confirms]
payment_confirmed
  ↓ [treasury settled]
payment_settled → ready_for_deployment
```

### Current Gaps
- No quote expiration (should expire after 10 minutes)
- No payment state persistence (status lost on restart)
- No failed payment handling (what if tx dropped?)
- No on-chain verification (just mocked)

### Verdict
**Gap**: Payment flow is a boolean gate, not a state machine. Orchestrator prep kit requires explicit states.

---

## 4. Deployment: Agent Store vs. Deployment Record

### Current: DeployedAgent (Agent-centric)
```typescript
interface DeployedAgent {
  agent_id: string;
  service_id: string;
  agent_name: string;
  owner_id?: string;
  payment_tx_hash: string;
  status: 'provisioning' | 'running' | 'paused' | 'failed' | 'stopped';
  console_url?: string;
  deployed_at: Date;
  last_activity: Date;
  logs: Array<{...}>;
}
```

### Needed: Deployment Record (Control Plane-centric)
```typescript
interface Deployment {
  id: string;           // dep_xyz
  tier_id: string;      // travel-pro
  region: string;       // us-east
  customer_id: string;  // cust_abc
  payment_id: string;   // pay_123
  runtime_instance_id: string;  // rt_789
  status: 'provisioning' | 'ready' | 'error';
  endpoint: string;     // https://agent-rt-789.clawdrop.ai
  console_url: string;
  created_at: Date;
  updated_at: Date;
  container_id?: string;  // Docker container ID
  server_id?: string;     // Which server it's on
}
```

### Current Gaps
- No tier_id tracking (what tier was purchased?)
- No payment_id link (which payment triggered this?)
- No region tracking (where is it deployed?)
- No endpoint generation logic (how does customer access it?)
- No server_id (which physical/cloud server?)
- No container_id (what's the Docker container ID?)

### Verdict
**Gap**: Agent store tracks the agent, not the deployment. Orchestrator needs deployment records.

---

## 5. Provisioner Integration: Missing

### Current State
```typescript
// In create_openclaw_agent tool
if (req.service_id === 'treasury-pro') {
  // Returns mock deployment
  return {
    agent_id: 'agnt_' + deploymentId,
    status: 'deploying'
  };
}
```

### Needed: Real Provisioner Contract

**Interface** (missing):
```typescript
interface DeployRequest {
  deployment_id: string;
  tier_id: string;
  region: string;
  capability_bundle: string;
  payment_verified: boolean;
  wallet_address: string;
  config: {
    display_name?: string;
    approval_policy?: {...};
  };
}

interface DeployResponse {
  deployment_id: string;
  runtime_instance_id: string;
  status: 'provisioning' | 'ready' | 'error';
  endpoint?: string;
  error?: string;
}

interface Provisioner {
  deploy(req: DeployRequest): Promise<DeployResponse>;
  status(deploymentId: string): Promise<DeployStatus>;
  logs(deploymentId: string): Promise<string[]>;
}
```

### Current Gaps
- No provisioner abstraction (hard to swap backends)
- No deploy contract document
- No Docker integration (no dockerode in dependencies)
- No SSH/remote execution (can't actually provision)
- No server selection logic (which server gets the container?)
- No MCP bundle installer (bundles not installed at all)

### Verdict
**Gap**: Provisioning is 100% stubbed. No real backend wired.

---

## 6. Capability Bundles: Hardcoded vs. Versioned Registry

### Current State
When you deploy an agent, there's no bundle logic:
```typescript
// In create_openclaw_agent
const agent = {
  agent_id: deploymentId,
  service_id: req.service_id,
  // No bundle tracking
  // No MCP installation
};
```

### Needed: Named Bundle Registry

**Structure** (missing):
```
src/runtime/capability-bundles.ts
  export const BUNDLES = {
    'starter-core': {
      id: 'starter-core',
      mcps: ['crypto-payments'],
      env: { PAYMENT_MODE: 'view-only' },
    },
    'travel-crypto-pro': {
      id: 'travel-crypto-pro',
      mcps: ['travel-search', 'crypto-payments', 'wallet-policy'],
      env: { BOOKING_MODE: 'full', APPROVE_THRESHOLD: 500 },
    },
  };
```

And in deployment:
```typescript
const bundle = BUNDLES[req.bundle_names[0]];
// Should install MCPs into the runtime
// Should inject environment config
// Should verify installation succeeded
```

### Current Gaps
- No bundles defined (hardcoded per tier)
- No versioning (can't update bundles)
- No installer logic (how do MCPs get into runtime?)
- No configuration per bundle
- No MCP dependency tracking

### Verdict
**Gap**: Bundles are not a first-class abstraction. They're implicit in service definitions.

---

## 7. Storage: In-Memory Only

### Current State
```typescript
// src/db/memory.ts
const agents = new Map<string, DeployedAgent>();

// Persists across tool calls (within same process)
// Lost on restart
// No customer isolation
// No query capabilities
```

### Needed: Persistent Storage Interface

**Design** (missing):
```typescript
interface DeploymentStore {
  create(deployment: Deployment): Promise<Deployment>;
  get(id: string): Promise<Deployment | null>;
  update(id: string, partial: Partial<Deployment>): Promise<Deployment>;
  list(filter: {customer_id?: string}): Promise<Deployment[]>;
}

interface PaymentStore {
  create(payment: Payment): Promise<Payment>;
  get(id: string): Promise<Payment | null>;
  updateStatus(id: string, status: Payment['status']): Promise<void>;
  getByTx(tx_hash: string): Promise<Payment | null>;
}
```

### Current Gaps
- No PostgreSQL (plan says "Phase 2")
- No abstraction interface (coupling to Map-based storage)
- No query language (can't filter by customer_id, tier_id, status)
- No transaction support (payment + deployment must be atomic)
- No migrations (no versioning as schema evolves)

### Verdict
**Gap**: Storage is in-memory stub. Orchestrator prep kit allows this for Friday but needs interface for later replacement.

---

## 8. Documentation: Mixed State

### ✅ Excellent Docs
- `RESTRUCTURING_PLAN.md` — Clear 3-layer model
- `CLAUDE_CODE_ORCHESTRATOR_PREP.md` — Clear mission + requirements
- `FINAL_HANDOFF.md` — Status summary for handoff

### ❌ Missing Reference Docs
```
references/
├── deployment-contract.md         ← MISSING
├── capability-bundles.md          ← MISSING
├── payment-state-machine.md       ← MISSING
└── mexico-demo-script.md          ← MISSING
```

### ⚠️ Stale Docs
- `CLAUDE_CODE_SETUP.md` — Still references `list_services`, `create_openclaw_agent` (old names)
- `SPRINT_PLAN.md` — Track-based plan (doesn't reflect new restructuring)
- `TRACK_HANDOFF.md` — References HFSP stub (may be outdated)
- `README.md` — One-liner, needs expansion

### Verdict
**Gap**: Strategic docs are solid. Tactical reference docs missing. Stale docs need refresh.

---

# MAPPING: Current vs. Orchestrator Prep Kit

## Deliverable A — Repo Reframe

| Item | Status | Next Step |
|------|--------|-----------|
| Rename services → tiers | ⚠️ Half | Update JSON + schemas + tools |
| Rename tools to control-plane names | ⚠️ Half | 5/5 tools need names + 7 new tools |
| Split tool handlers | ❌ No | Need src/server/tools/ directory |
| Add tier catalog module | ❌ No | Create src/catalog/tiers.ts |
| Add region catalog | ❌ No | Create src/catalog/regions.ts |
| Deployment state model | ❌ No | Create Deployment interface |
| Payment state model | ❌ No | Create Payment interface + state machine |
| Storage interfaces | ❌ No | Define abstract interfaces for later DB swap |

**Verdict**: 20% complete.

---

## Deliverable B — Architecture Contract

| Item | Status | Next Step |
|------|--------|-----------|
| Deploy request interface | ❌ No | Define in references/deployment-contract.md |
| Deploy response interface | ❌ No | Define in references/deployment-contract.md |
| Provisioner abstraction | ❌ No | Create src/provisioner/contract.ts |
| Health check protocol | ❌ No | Define polling + timeout logic |
| Secret injection strategy | ❌ No | Document in references/ |
| MCP bundle installer spec | ❌ No | Define in references/capability-bundles.md |
| Payment state machine | ❌ No | Define in references/payment-state-machine.md |

**Verdict**: 0% complete.

---

## Deliverable C — One Gold Path

| Step | Status | Details |
|------|--------|---------|
| 1. Choose tier | ⚠️ Partial | list_services works, but needs rename + regions |
| 2. Verify payment | ❌ Stubbed | No real Solana verification (Kimi's job) |
| 3. Provision Docker | ❌ Missing | No Docker SDK, no provisioner |
| 4. Install capability | ❌ Missing | No bundle installer logic |
| 5. Return connection | ❌ Partial | Schema ready, but no real endpoint |

**Verdict**: 20% complete end-to-end.

---

# CRITICAL PATH BLOCKERS

## Must Resolve Before Friday Demo

### Blocker 1: Provisioner Backend Decision
**Current**: Unknown
**Impact**: Can't actually deploy containers
**Decision Options**:
- HFSP (if it supports full provisioning)
- SSH + Docker CLI (fast, not scalable)
- Custom Node.js provisioner service
- Fly.io / Railway API (vendor lock-in)

**Recommendation**: SSH + Docker CLI for Friday (1-2 hours), migrate to custom service post-demo.

### Blocker 2: Solana Signing
**Current**: Stubbed (Kimi's responsibility)
**Impact**: Can't verify real payment
**Status**: Kimi should deliver by Friday 3 PM
**Dependencies**: @solana/web3.js, Helius API

### Blocker 3: Tier Catalog
**Current**: services.json (generic)
**Impact**: Can't distinguish tiers or select bundles
**Quick Fix** (1 hour):
```bash
mv src/data/services.json src/data/tiers.json
# Add runtime_preset + capability_bundle to each tier
# Rename Service → Tier in schemas.ts
```

---

# DEPENDENCIES: What's Missing from package.json

| Package | Purpose | Status | Needed |
|---------|---------|--------|--------|
| `dockerode` | Docker SDK | Missing | ✅ For real provisioning |
| `@solana/web3.js` | Solana signing | Missing | ✅ For real payment (Kimi) |
| `pg` | PostgreSQL client | Missing | ⚠️ For Phase 2 (not Friday) |
| `dotenv` | Env var loading | Missing | ✅ For secrets |

**Recommendation**: Add dockerode + dotenv today. @solana/web3.js added by Kimi.

---

# SCRIPTS: What Exists

| Script | Purpose | Status | Friday Ready |
|--------|---------|--------|--------------|
| `quick-test.ts` | Test all 5 tools | ✅ Working | ✅ Yes |
| `monitor.ts` | Real-time dashboard | ✅ Working | ✅ Yes |
| `demo-advanced.ts` | Full flow demo | ✅ Working | ✅ Yes (with caveats) |
| `demo-friday.ts` | Friday presentation | ❌ Missing | 🔴 Needs creation |
| `smoke-test.ts` | Pre-flight checks | ❌ Missing | ⚠️ Nice-to-have |

---

# PRIORITY EXECUTION PLAN

## Phase 0 (Today, 4 hours) — Reframe

1. ✅ **Create AUDIT_REPO_STATE.md** (this document)
2. 🔲 **Rename tiers** (1 hour)
   - mv services.json → tiers.json
   - Update Service → Tier in schemas.ts
   - Add runtime_preset, capability_bundle, regions to tier schema
3. 🔲 **Rename tools** (1 hour)
   - Rename list_services → list_tiers
   - Rename quote_service → quote_tier
   - Add create_checkout, verify_payment (stubs)
   - Rename create_openclaw_agent → deploy_openclaw_instance
   - Rename get_agent_status → get_deployment_status
   - Add get_instance_connection_info (stub)
4. 🔲 **Define data models** (1 hour)
   - Create src/data/models.ts with Tier, Deployment, Payment, Customer, Region
   - Update src/db/memory.ts to support Deployment and Payment storage
5. 🔲 **Create deployment contract** (1 hour)
   - Write references/deployment-contract.md
   - Define DeployRequest / DeployResponse interfaces
   - Create src/provisioner/contract.ts

---

## Phase 1 (Tomorrow, 6 hours) — Wire Provisioning

1. 🔲 **Decide provisioner backend** (30 min)
   - Confirm HFSP capability OR
   - Decide on SSH + Docker OR
   - Plan custom service
2. 🔲 **Implement provisioner client** (2 hours)
   - src/provisioner/client.ts
   - Wire into deploy_openclaw_instance tool
3. 🔲 **Add Docker SDK** (1 hour)
   - npm install dockerode
   - Test local Docker integration
4. 🔲 **Enhance deployment status** (1.5 hours)
   - Query Docker for real stats
   - Implement status polling

---

## Phase 2 (Friday Morning, 2 hours) — Integration Test

1. 🔲 **Wire real Solana signing** (with Kimi)
   - verify_payment confirms real tx
2. 🔲 **Test full flow** (1 hour)
   - tier selection → quoting → payment → deployment → status
3. 🔲 **Create demo-friday.ts** (30 min)
   - Orchestrated 5-step demo for stakeholders

---

# VERDICT: Gap Assessment

| Category | Coverage | Verdict |
|----------|----------|---------|
| **Architecture** | 70% | Good strategic docs, implementation lags |
| **Tools** | 40% | 5 tools exist, 7 missing, 3 need rename |
| **Data Models** | 20% | Agent store only, Deployment/Payment missing |
| **Payment Flow** | 30% | Boolean gate, not state machine |
| **Provisioning** | 0% | Completely stubbed |
| **Bundles** | 0% | Not a first-class abstraction |
| **Storage** | 10% | In-memory only, no interfaces |
| **Documentation** | 60% | Strategy strong, tactics weak |

**Overall**: Repo is 40% of the way to a real control plane. The architecture is sound, but implementation gaps are significant. Doable for Friday with focused effort on Phase 0-1.

---

# RECOMMENDED IMMEDIATE ACTIONS

## Do Today (4 hours)
- [ ] Rename tools (services → tiers terminology)
- [ ] Update tier catalog with metadata
- [ ] Define Deployment + Payment models
- [ ] Create deployment contract document

## Do Tomorrow (6 hours)
- [ ] Implement provisioner client (Docker or SSH)
- [ ] Wire into deploy tool
- [ ] Test Docker integration locally
- [ ] Refresh old documentation

## Friday Morning (2 hours)
- [ ] Wire Kimi's Solana signing
- [ ] Integration test full flow
- [ ] Create demo-friday.ts script

## Post-Friday (Week 1)
- [ ] Add PostgreSQL persistence
- [ ] Implement capability bundle installer
- [ ] Add multi-region deployment logic
- [ ] Build Claw Console dashboard

