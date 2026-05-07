# IMPLEMENTATION ROADMAP: Friday Demo + Control Plane Build

**Status**: April 15, 2026, 2:30 PM
**Target**: Friday demo + real gold-path deployment
**Current Gap**: 60% (architecture clear, implementation behind)

---

# SYNTHESIS: Three Plans, One Path

You now have three strategic documents:
1. **RESTRUCTURING_PLAN.md** — The "what" (3-layer architecture, product model)
2. **CLAUDE_CODE_ORCHESTRATOR_PREP.md** — The "how" (Friday demo, tool definitions)
3. **AUDIT_REPO_STATE.md** — The "where we are" (40% complete, critical gaps identified)

This document is the **execution plan**: the exact sequence of work to get from 40% to 100% by Friday.

---

# CRITICAL INSIGHT: Friday Success Depends on One Decision

**You cannot build the full control plane in 3 days.**

But you **can** build a real, honest gold-path that demonstrates the product model:

```
Tier Selection → Payment Verification → Docker Deployment → Ready Runtime
```

**The key**: Each step must be real or realistically simulated.

---

# PHASE 0: TODAY (Now — 4 hours)

## Objective
Rename the repo conceptually from "demo agent" to "control plane." This unblocks all downstream work.

### Task 0.1: Rename Core Concepts (45 min)

**Current → New**
```
services.json → tiers.json
Service → Tier
list_services → list_tiers
quote_service → quote_tier
create_openclaw_agent → deploy_openclaw_instance
get_agent_status → get_deployment_status
```

**Do this now:**

1. Rename `src/data/services.json` to `src/data/tiers.json`
2. Update Zod schemas in `src/server/schemas.ts`:
   - Change `ServiceSchema` → `TierSchema`
   - Add fields: `runtime_preset`, `capability_bundle`, `supported_regions`
3. Update tool names in `src/server/tools.ts`
4. Update tool handlers to use new names

**File edits**:
```typescript
// src/server/schemas.ts (excerpt)
export const TierSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price_usd: z.number(),
  price_sol: z.number(),
  price_herd: z.number(),
  runtime_preset: z.enum(['small', 'medium', 'large']),      // NEW
  capability_bundle: z.string(),                              // NEW
  supported_regions: z.array(z.string()),                     // NEW
  payment_tokens: z.array(z.enum(['SOL', 'HERD'])),
  monthly_memory_mb: z.number().optional(),                   // NEW
  monthly_storage_gb: z.number().optional(),                  // NEW
});
```

### Task 0.2: Define Data Models (45 min)

Create `src/data/models.ts` with explicit types:

```typescript
// src/data/models.ts
export interface Tier {
  id: string;
  name: string;
  price_usd: number;
  runtime_preset: 'small' | 'medium' | 'large';
  capability_bundle: string;
  supported_regions: string[];
}

export interface Deployment {
  id: string;                    // dep_xyz
  tier_id: string;
  customer_id: string;
  payment_id: string;
  region: string;
  runtime_instance_id?: string;  // rt_789
  status: 'provisioning' | 'ready' | 'error';
  endpoint?: string;             // https://...
  container_id?: string;
  server_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Payment {
  id: string;                    // pay_xyz
  customer_id: string;
  tier_id: string;
  amount_sol: number;
  token: 'SOL' | 'HERD';
  status: 'quoted' | 'pending' | 'confirmed' | 'failed' | 'expired';
  tx_hash?: string;
  verified_at?: Date;
  expires_at: Date;              // Quote expires after 10 min
  created_at: Date;
}

export interface Customer {
  id: string;
  wallet_address: string;
  created_at: Date;
}

export interface Region {
  id: string;
  name: string;
  server_capacity: number;
  current_deployments: number;
}
```

### Task 0.3: Create Deployment Contract (45 min)

Create `references/deployment-contract.md`:

```markdown
# Deployment Contract

## Control Plane → Provisioner Request

```json
{
  "deployment_id": "dep_123",
  "customer_id": "cust_abc",
  "tier_id": "travel-pro",
  "region": "us-east",
  "capability_bundle": "travel-crypto-pro",
  "payment_verified": true,
  "wallet_address": "7qj...",
  "config": {
    "display_name": "My Travel Agent",
    "approval_policy": {
      "requires_approval_above_usd": 500
    }
  }
}
```

## Provisioner → Control Plane Response

```json
{
  "deployment_id": "dep_123",
  "runtime_instance_id": "rt_789",
  "status": "provisioning",
  "endpoint": "http://localhost:8001",
  "server_id": "srv_us_east_01",
  "container_id": "abc123def456",
  "error": null
}
```

## Status Polling Response

```json
{
  "deployment_id": "dep_123",
  "runtime_instance_id": "rt_789",
  "status": "ready",
  "health": "passing",
  "container_stats": {
    "cpu_percent": "2.1",
    "memory_mb": "145",
    "uptime_seconds": 35
  },
  "endpoint": "https://agent-rt-789.clawdrop.ai",
  "included_capabilities": ["travel-search", "crypto-payments"],
  "recent_logs": [...]
}
```
```

### Task 0.4: Create Provisioner Contract in Code (30 min)

Create `src/provisioner/contract.ts`:

```typescript
// src/provisioner/contract.ts

export interface DeployRequest {
  deployment_id: string;
  tier_id: string;
  region: string;
  capability_bundle: string;
  payment_verified: boolean;
  wallet_address: string;
  config?: {
    display_name?: string;
    approval_policy?: Record<string, any>;
  };
}

export interface DeployResponse {
  deployment_id: string;
  runtime_instance_id: string;
  status: 'provisioning' | 'ready' | 'error';
  endpoint?: string;
  server_id?: string;
  container_id?: string;
  error?: string;
}

export interface DeploymentStatus {
  deployment_id: string;
  runtime_instance_id: string;
  status: 'provisioning' | 'ready' | 'error';
  health: 'passing' | 'degraded' | 'failing';
  container_stats?: {
    cpu_percent: string;
    memory_mb: string;
    uptime_seconds: number;
  };
  endpoint?: string;
  included_capabilities: string[];
  recent_logs: string[];
  error?: string;
}

export interface IProvisioner {
  deploy(req: DeployRequest): Promise<DeployResponse>;
  status(deploymentId: string): Promise<DeploymentStatus>;
  logs(deploymentId: string): Promise<string[]>;
}
```

---

## PHASE 0 CHECKLIST

- [ ] Rename services.json → tiers.json
- [ ] Update TierSchema in schemas.ts with new fields
- [ ] Rename tool handlers (5 tools)
- [ ] Create src/data/models.ts with 5 interfaces
- [ ] Create references/deployment-contract.md
- [ ] Create src/provisioner/contract.ts
- [ ] Commit: "refactor: Rename from services to tiers, define data models"
- [ ] Verify: `npm run build` passes

**Estimated time**: 4 hours
**Blocker after**: None (enables Phase 1)

---

# PHASE 1: TOMORROW (April 16, 6 hours)

## Objective
Wire provisioning backend. Make Docker containers actually spin up.

### Critical Decision: Provisioner Backend

**You must decide today** (or confirm with Kimi/team):
- Is HFSP the provisioner?
- Or do we use SSH + Docker CLI?
- Or do we build a minimal Node.js provisioner?

**Recommendation for Friday**: SSH + Docker CLI is fastest.

```
Control Plane MCP (this repo)
    ↓ SSH command
Server with Docker
    ↓ docker run clawdrop/openclaw:latest
Containerized OpenClaw runtime on port 8001
```

**Implementation** (1.5 hours if SSH + Docker):

```typescript
// src/provisioner/ssh-docker-client.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SSHDockerProvisioner implements IProvisioner {
  private host = process.env.PROVISIONER_HOST || 'localhost';
  private user = process.env.PROVISIONER_USER || 'deploy';

  async deploy(req: DeployRequest): Promise<DeployResponse> {
    try {
      // Generate unique port (8001 + hash of deployment_id)
      const port = 8001 + (parseInt(req.deployment_id.slice(0, 8), 16) % 1000);

      // Build Docker run command
      const cmd = `
        docker run -d \
          --name ${req.deployment_id} \
          -p ${port}:8000 \
          -e DEPLOYMENT_ID=${req.deployment_id} \
          -e BUNDLE=${req.capability_bundle} \
          -e WALLET=${req.wallet_address} \
          clawdrop/openclaw:latest
      `;

      // Execute over SSH
      const { stdout } = await execAsync(`ssh ${this.user}@${this.host} "${cmd}"`);
      const container_id = stdout.trim();

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: `rt_${req.deployment_id}`,
        status: 'provisioning',
        endpoint: `http://${this.host}:${port}`,
        container_id,
        server_id: this.host,
      };
    } catch (error) {
      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: '',
        status: 'error',
        error: error.message,
      };
    }
  }

  async status(deploymentId: string): Promise<DeploymentStatus> {
    try {
      const cmd = `docker inspect ${deploymentId} --format='{{.State.Status}}'`;
      const { stdout } = await execAsync(`ssh ${this.user}@${this.host} "${cmd}"`);
      const containerStatus = stdout.trim();

      return {
        deployment_id: deploymentId,
        runtime_instance_id: `rt_${deploymentId}`,
        status: containerStatus === 'running' ? 'ready' : 'provisioning',
        health: containerStatus === 'running' ? 'passing' : 'degraded',
        endpoint: `http://${this.host}:8001`,  // Simplified
        included_capabilities: ['placeholder'],
        recent_logs: [],
      };
    } catch (error) {
      return {
        deployment_id: deploymentId,
        runtime_instance_id: '',
        status: 'error',
        health: 'failing',
        included_capabilities: [],
        recent_logs: [],
        error: error.message,
      };
    }
  }

  async logs(deploymentId: string): Promise<string[]> {
    try {
      const cmd = `docker logs ${deploymentId} --tail 10`;
      const { stdout } = await execAsync(`ssh ${this.user}@${this.host} "${cmd}"`);
      return stdout.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
```

**OR** (if using dockerode locally):

```typescript
// src/provisioner/docker-client.ts

import Docker from 'dockerode';
import { IProvisioner, DeployRequest, DeployResponse, DeploymentStatus } from './contract';

export class DockerProvisioner implements IProvisioner {
  private docker = new Docker();

  async deploy(req: DeployRequest): Promise<DeployResponse> {
    try {
      const port = 8001 + (parseInt(req.deployment_id.slice(0, 8), 16) % 1000);

      const container = await this.docker.createContainer({
        Image: 'clawdrop/openclaw:latest',
        Env: [
          `DEPLOYMENT_ID=${req.deployment_id}`,
          `BUNDLE=${req.capability_bundle}`,
          `WALLET=${req.wallet_address}`,
        ],
        ExposedPorts: { '8000/tcp': {} },
        HostConfig: {
          PortBindings: { '8000/tcp': [{ HostPort: port.toString() }] },
          Memory: 512 * 1024 * 1024,
        },
      });

      await container.start();

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: `rt_${req.deployment_id}`,
        status: 'provisioning',
        endpoint: `http://localhost:${port}`,
        container_id: container.id,
        server_id: 'local',
      };
    } catch (error) {
      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: '',
        status: 'error',
        error: error.message,
      };
    }
  }

  async status(deploymentId: string): Promise<DeploymentStatus> {
    try {
      const container = this.docker.getContainer(deploymentId);
      const inspect = await container.inspect();

      return {
        deployment_id: deploymentId,
        runtime_instance_id: `rt_${deploymentId}`,
        status: inspect.State.Running ? 'ready' : 'provisioning',
        health: inspect.State.Running ? 'passing' : 'degraded',
        endpoint: `http://localhost:${inspect.NetworkSettings.Ports['8000/tcp'][0].HostPort}`,
        included_capabilities: [],
        recent_logs: [],
      };
    } catch (error) {
      return {
        deployment_id: deploymentId,
        runtime_instance_id: '',
        status: 'error',
        health: 'failing',
        included_capabilities: [],
        recent_logs: [],
        error: error.message,
      };
    }
  }

  async logs(deploymentId: string): Promise<string[]> {
    try {
      const container = this.docker.getContainer(deploymentId);
      const logs = await container.logs({ stdout: true, stderr: true, tail: 10 });
      return logs.toString().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
```

### Task 1.1: Implement Provisioner Client (2 hours)

Choose one approach above (SSH or dockerode).

**File**: `src/provisioner/client.ts`

Wire into tool:

```typescript
// src/server/tools.ts (deploy_openclaw_instance handler)

import { DockerProvisioner } from '../provisioner/docker-client';

const provisioner = new DockerProvisioner();

async function handleDeployOpenclawInstance(req: DeployOpenclawInstanceRequest) {
  const deployment_id = `dep_${Date.now()}`;

  // Request deployment
  const deployResponse = await provisioner.deploy({
    deployment_id,
    tier_id: req.tier_id,
    region: req.region || 'us-east',
    capability_bundle: req.capability_bundle || 'default',
    payment_verified: req.payment_verified || false,
    wallet_address: req.wallet_address,
  });

  // Save to memory store
  const deployment: Deployment = {
    id: deployment_id,
    tier_id: req.tier_id,
    customer_id: req.customer_id,
    payment_id: req.payment_id,
    region: req.region || 'us-east',
    runtime_instance_id: deployResponse.runtime_instance_id,
    status: deployResponse.status as any,
    endpoint: deployResponse.endpoint,
    container_id: deployResponse.container_id,
    created_at: new Date(),
    updated_at: new Date(),
  };

  saveDeployment(deployment);

  return {
    deployment_id,
    runtime_instance_id: deployResponse.runtime_instance_id,
    status: 'provisioning',
    endpoint: deployResponse.endpoint,
    console_url: `https://console.clawdrop.ai/deployments/${deployment_id}`,
  };
}
```

### Task 1.2: Update Memory Store (1.5 hours)

Extend `src/db/memory.ts` to support Deployments and Payments:

```typescript
// src/db/memory.ts (new functions)

import { Deployment, Payment } from '../data/models';

const deployments = new Map<string, Deployment>();
const payments = new Map<string, Payment>();

export function saveDeployment(deployment: Deployment): void {
  deployments.set(deployment.id, deployment);
}

export function getDeployment(id: string): Deployment | null {
  return deployments.get(id) || null;
}

export function updateDeployment(id: string, updates: Partial<Deployment>): void {
  const deployment = deployments.get(id);
  if (deployment) {
    Object.assign(deployment, updates, { updated_at: new Date() });
  }
}

export function savePayment(payment: Payment): void {
  payments.set(payment.id, payment);
}

export function getPayment(id: string): Payment | null {
  return payments.get(id) || null;
}

export function updatePaymentStatus(id: string, status: Payment['status']): void {
  const payment = payments.get(id);
  if (payment) {
    payment.status = status;
  }
}
```

### Task 1.3: Update Tool Handlers (1.5 hours)

Update each tool to use new data models:

- `list_tiers`: Return tiers with runtime_preset + bundle
- `quote_tier`: Create Payment record, return quote with expiration
- `create_checkout`: Create Payment in 'quoted' state
- `verify_payment`: Update Payment to 'confirmed' state
- `deploy_openclaw_instance`: Use provisioner client, save Deployment
- `get_deployment_status`: Query Docker via provisioner, return real stats

### Task 1.4: Documentation Refresh (1 hour)

- Update README.md to explain control plane model
- Refresh CLAUDE_CODE_SETUP.md with new tool names
- Create references/capability-bundles.md (stub)
- Create references/payment-state-machine.md (stub)

---

## PHASE 1 CHECKLIST

- [ ] Decide provisioner backend (SSH / dockerode / HFSP)
- [ ] Implement provisioner client (choice of 2 above)
- [ ] Wire provisioner into deploy_openclaw_instance tool
- [ ] Update memory store to support Deployments + Payments
- [ ] Update tool handlers to use new data models
- [ ] Refresh documentation
- [ ] Test locally: `npm run test:tools`
- [ ] Commit: "feat: Wire provisioner backend, update tools to deployment model"
- [ ] Verify: Real Docker containers spin up

**Estimated time**: 6 hours
**Blocker after**: None (enables Friday integration)

---

# PHASE 2: FRIDAY MORNING (April 18, 2 hours)

## Objective
Integration test + demo script.

### Task 2.1: Wire Kimi's Solana Signing (30 min)

Kimi delivers `@solana/web3.js` integration for verify_payment. You integrate:

```typescript
// src/server/tools.ts (verify_payment handler)

import { @solana/web3.js } from '@solana/web3.js';
import { verifyTransaction } from '../integrations/helius';

async function handleVerifyPayment(req: VerifyPaymentRequest) {
  const payment = getPayment(req.payment_id);
  if (!payment) throw new Error('Payment not found');

  // Verify tx on devnet
  const confirmed = await verifyTransaction(payment.tx_hash);
  
  if (confirmed) {
    updatePaymentStatus(req.payment_id, 'confirmed');
    return {
      payment_id: req.payment_id,
      verified: true,
      tx_hash: payment.tx_hash,
      amount_sol: payment.amount_sol,
      status: 'confirmed',
    };
  } else {
    updatePaymentStatus(req.payment_id, 'failed');
    throw new Error('Transaction not confirmed on chain');
  }
}
```

### Task 2.2: Full Integration Test (45 min)

Run the complete flow:

```bash
# Terminal 1: Start MCP server
npm run dev

# Terminal 2: Run integration test
npm run test:integration  # (new script)
```

Test sequence:
1. list_tiers → Shows 3+ tiers ✅
2. quote_tier → Returns quote in SOL ✅
3. create_checkout → Payment created in 'quoted' state ✅
4. verify_payment → Real Solana tx confirmed ✅ (Kimi's part)
5. deploy_openclaw_instance → Docker container spins ✅
6. get_deployment_status → Real Docker stats returned ✅

### Task 2.3: Create Demo Script (45 min)

Create `scripts/demo-friday.ts`:

```typescript
// scripts/demo-friday.ts

import { MCPClient } from '../src/server/mcp';

async function runFridayDemo() {
  const client = new MCPClient();

  console.log('\n🎬 CLAWDROP FRIDAY DEMO\n');
  console.log('='.repeat(50));

  // Phase 1: Discover
  console.log('\n📦 PHASE 1: Service Discovery');
  const tiers = await client.callTool('list_tiers', {});
  console.log(`✅ Found ${tiers.tiers.length} tiers`);
  tiers.tiers.slice(0, 3).forEach(t => {
    console.log(`   - ${t.name}: ${t.price_usd}/mo (${t.price_sol} SOL)`);
  });

  // Phase 2: Quote
  console.log('\n💰 PHASE 2: Pricing & Selection');
  const quote = await client.callTool('quote_tier', {
    tier_id: 'travel-pro',
  });
  console.log(`✅ Travel Pro: ${quote.amount_sol} SOL`);
  console.log(`   Includes: ${quote.capability_bundle}`);
  console.log(`   Quote expires: ${quote.expires_at}`);

  // Phase 3: Checkout
  console.log('\n🛒 PHASE 3: Checkout');
  const checkout = await client.callTool('create_checkout', {
    tier_id: 'travel-pro',
    payment_token: 'SOL',
  });
  console.log(`✅ Checkout created: ${checkout.checkout_id}`);
  console.log(`   Pay this amount: ${checkout.amount_sol} SOL`);

  // Phase 4: Payment (simulated — user signs)
  console.log('\n💳 PHASE 4: Payment Verification');
  console.log('   [User signs transaction with wallet...]');
  const payment = await client.callTool('verify_payment', {
    checkout_id: checkout.checkout_id,
    tx_hash: 'real_devnet_tx_hash_here', // Simulated
  });
  console.log(`✅ Payment confirmed: ${payment.tx_hash}`);
  console.log(`   Explorer: https://solscan.io/tx/${payment.tx_hash}`);

  // Phase 5: Deployment
  console.log('\n🚀 PHASE 5: Deployment');
  const deployment = await client.callTool('deploy_openclaw_instance', {
    tier_id: 'travel-pro',
    region: 'us-east',
    payment_id: payment.payment_id,
    wallet_address: 'user_wallet_here',
  });
  console.log(`✅ Deployment started: ${deployment.deployment_id}`);
  console.log(`   Endpoint: ${deployment.endpoint}`);

  // Phase 6: Status Monitoring
  console.log('\n📊 PHASE 6: Status Monitoring');
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 30) {
    const status = await client.callTool('get_deployment_status', {
      deployment_id: deployment.deployment_id,
    });

    console.log(`   Status: ${status.status}`);
    if (status.container_stats) {
      console.log(`   CPU: ${status.container_stats.cpu_percent}%`);
      console.log(`   Memory: ${status.container_stats.memory_mb}MB`);
    }

    if (status.status === 'ready') {
      isReady = true;
      console.log(`\n✅ READY! Endpoint: ${status.endpoint}`);
      console.log(`   Capabilities: ${status.included_capabilities.join(', ')}`);
    } else {
      await new Promise(r => setTimeout(r, 2000));
    }

    attempts++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Demo Complete!\n');
}

runFridayDemo().catch(console.error);
```

Add to package.json:

```json
{
  "scripts": {
    "demo:friday": "tsx scripts/demo-friday.ts"
  }
}
```

---

## PHASE 2 CHECKLIST

- [ ] Integrate Kimi's Solana signing
- [ ] Run full integration test (all 6 steps)
- [ ] Create demo-friday.ts script
- [ ] Pre-flight check: `npm run build && npm run demo:friday`
- [ ] Commit: "demo: Friday presentation flow"
- [ ] Verify: Full gold-path works end-to-end

**Estimated time**: 2 hours
**Blocker after**: None (ready for demo!)

---

# FRIDAY DEMO: What to Show Stakeholders

```
You: "I want to deploy a Travel Pro agent."

Claude: "Perfect! Let me show you how that works."
[runs demo-friday.ts]

Shows:
1. Tier selection (what you can buy)
2. Pricing (in SOL)
3. Quote creation (expires in 10 min)
4. Payment confirmation (real Solana tx on devnet)
5. Deployment triggered (Docker container spinning)
6. Status polling (real container stats)
7. Ready! (https://agent-rt-xyz.clawdrop.ai)

You: "Beautiful. What can my agent actually do?"

Claude: "It has travel-search, crypto-payments, and wallet-policy MCPs built in."

You: "Show me the endpoint."

Claude: Shows real HTTP endpoint, ready for API calls.
```

**Key talking points**:
- ✅ Real Solana integration (devnet tx visible on explorer)
- ✅ Real Docker containers (Deployment records persistent)
- ✅ Real capability bundles (MCPs preinstalled)
- ✅ Real endpoint (customer can use immediately)
- ⚠️ This is the control plane (you buy here)
- ⚠️ Your deployed agent runs on our servers (use there)

---

# POST-FRIDAY: Week 1 Priorities

(Once demo is done, immediately start these)

## Week 1: Production Hardening

1. **PostgreSQL Persistence** (6 hours)
   - Replace in-memory Map with real DB
   - migrations/ folder for schema versioning
   - Connection pooling

2. **Capability Bundle Installer** (4 hours)
   - Bundle registry with versioning
   - Extract MCPs into runtime
   - Verify installation succeeded

3. **Multi-Region Strategy** (4 hours)
   - Region catalog
   - Server selection logic
   - Failover handling

4. **Customer Auth** (4 hours)
   - API keys
   - JWT verification
   - Rate limiting

## Week 2: Scaling

1. **Kubernetes or Docker Swarm** (instead of single server)
2. **Real monitoring** (Prometheus + Grafana)
3. **Backup & restore** workflows
4. **Console dashboard** (Claw Console UI)

---

# SUCCESS CRITERIA

## Friday Demo
- ✅ Real Solana tx signed & confirmed on devnet
- ✅ Docker container spins up
- ✅ Customer gets real endpoint
- ✅ Full flow works in < 2 minutes
- ✅ Repo reflects "control plane" positioning

## End of Week 1
- ✅ Deployments persist in PostgreSQL
- ✅ Capability bundles install correctly
- ✅ Multi-region selection works
- ✅ Customer can access deployed agent via endpoint

---

# RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Docker not available on target system | Medium | Demo blocked | Use Fly.io or Railway as backup |
| Solana devnet rate limiting | Low | Payment fails | Use fallback RPC endpoint |
| HFSP not ready for provisioning | Medium | Can't deploy | Use SSH + Docker instead |
| Quote expires mid-demo | Low | Restart demo | Auto-renew quote if payment in-flight |
| Container doesn't become healthy | Medium | Demo stalls | Show logs, explain "provisioning" state |

---

# FINAL CHECKLIST

## Today (Phase 0)
- [ ] All tasks complete
- [ ] Commit to main
- [ ] Ready for tomorrow morning

## Tomorrow (Phase 1)
- [ ] All tasks complete
- [ ] Local testing passes
- [ ] Provisioner working
- [ ] Commit to main

## Friday (Phase 2)
- [ ] Kimi delivers Solana signing
- [ ] Integration test passes
- [ ] Demo script runs end-to-end
- [ ] Show stakeholders
- [ ] Capture video or screenshots
- [ ] Post-demo retrospective

---

# CONTACT POINTS

**You** (Control Plane):
- Provisioning orchestration
- Tool definitions
- Data models
- Demo script

**Kimi** (Track B):
- Real Solana signing (verify_payment)
- HFSP integration (if applicable)
- Deliver by Friday 3 PM

**Both**:
- Friday morning integration test
- Demo walkthrough for stakeholders

