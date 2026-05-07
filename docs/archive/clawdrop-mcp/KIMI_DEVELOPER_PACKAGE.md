# Kimi Developer Package: Solana Verification + HFSP Integration

## Your Role in Clawdrop

You are implementing the **critical path for the MCP Gateway**. Clawdrop is a discoverable MCP hub (like Docker Hub) that lets users deploy crypto agents. Your work enables real deployments:

```
User in Claude Code:
  "Deploy treasury-agent-pro"
     ↓
  [Your Solana verification]
     ↓
  [Your HFSP integration]
     ↓
  Agent running on Hostinger VPS
```

Without your work, deployments are simulated. **With your work, deployments are real.**

---

## What You're Building (Wednesday-Friday)

### Task A: Solana Payment Verification (40%, ~4 hours)

**Goal**: Verify Solana devnet transactions are actually confirmed on-chain

**Why it matters**: Users pay in SOL. We must verify they actually paid before provisioning.

**Current state**: Stub that accepts any tx_hash
```typescript
// Currently in src/server/tools.ts handleVerifyPayment()
const confirmed = parsed.tx_hash && parsed.tx_hash.length > 0; // ❌ Fake
```

**Your task**: Replace with real Helius verification
```typescript
// Your implementation
const confirmed = await verifyHeliusTransaction(parsed.tx_hash); // ✅ Real
```

**Implementation file**: `src/integrations/helius.ts`

```typescript
export async function verifyHeliusTransaction(tx_hash: string): Promise<boolean> {
  const url = 'https://devnet.helius-rpc.com/';
  const response = await axios.post(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getSignatureStatuses',
    params: [[tx_hash], { searchTransactionHistory: true }]
  });
  
  const status = response.data.result.value[0];
  return status?.confirmationStatus === 'finalized' || status?.confirmationStatus === 'confirmed';
}
```

**Testing**:
```bash
# Create a real devnet transaction
solana transfer --from keypair.json <recipient> 0.1 --url devnet

# Get the tx hash from output
# Call verify_payment with that tx hash
curl http://localhost:3000/tools/verify_payment \
  -H "Content-Type: application/json" \
  -d '{"payment_id": "pay_123", "tx_hash": "YOUR_HASH"}'

# Should return: verified: true
```

---

### Task B: HFSP Integration (60%, ~3 hours)

**Goal**: Provision OpenClaw instances on Hostinger VPS via HFSP API

**Why it matters**: After payment is verified, we launch the agent. HFSP handles the Docker deployment.

**Current state**: Stub that creates local deployment record
```typescript
// Currently in src/server/tools.ts handleDeployOpenclawInstance()
const deployment = { /* local in-memory only */ }
```

**Your task**: Call HFSP API to actually provision
```typescript
const response = await deployViaHFSP(deploymentRequest);
// HFSP returns agent endpoint, credentials, etc.
```

**Implementation file**: Create `src/provisioner/hfsp-client.ts`

```typescript
import axios from 'axios';
import { logger } from '../utils/logger';

interface HFSPDeployRequest {
  deployment_id: string;
  tier_id: string;
  region: string;
  capability_bundle: string;
  payment_verified: boolean;
  wallet_address: string;
  config?: Record<string, any>;
}

export async function deployViaHFSP(req: HFSPDeployRequest) {
  try {
    const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
    const hfspApiKey = process.env.HFSP_API_KEY || '';
    
    const response = await axios.post(
      `${hfspUrl}/api/v1/agents/deploy`,
      {
        deployment_id: req.deployment_id,
        tier_id: req.tier_id,
        region: req.region,
        capability_bundle: req.capability_bundle,
        payment_verified: req.payment_verified,
        wallet_address: req.wallet_address,
        config: req.config,
      },
      {
        headers: {
          Authorization: `Bearer ${hfspApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const { agent_id, endpoint, status, error } = response.data;
    if (error) throw new Error(error);
    
    logger.info({ deployment_id: req.deployment_id, agent_id, endpoint }, 'HFSP deployment successful');
    
    return { agent_id, endpoint, status: status || 'provisioning', error: null };
  } catch (error) {
    logger.error({ deployment_id: req.deployment_id, error: error.message }, 'HFSP deployment failed');
    return { agent_id: '', endpoint: '', status: 'error', error: error.message };
  }
}

export async function getHFSPStatus(agent_id: string) {
  try {
    const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
    const hfspApiKey = process.env.HFSP_API_KEY || '';
    
    const response = await axios.get(
      `${hfspUrl}/api/v1/agents/${agent_id}`,
      {
        headers: { Authorization: `Bearer ${hfspApiKey}` },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (error) {
    logger.error({ agent_id, error: error.message }, 'HFSP status check failed');
    return { agent_id, status: 'error', health: 'failing', error: error.message };
  }
}
```

**Wire into tools.ts**:

In `handleDeployOpenclawInstance()`:
```typescript
// After payment verification succeeds:
const hfspResponse = await deployViaHFSP({
  deployment_id: deploymentId,
  tier_id: parsed.tier_id,
  region: parsed.region || 'us-east',
  capability_bundle: tier.capability_bundle,
  payment_verified: true,
  wallet_address: parsed.wallet_address,
  config: parsed.config,
});

if (hfspResponse.error) {
  throw new Error(`HFSP deployment failed: ${hfspResponse.error}`);
}

// Update deployment with real agent_id and endpoint
deployment.agent_id = hfspResponse.agent_id;
deployment.endpoint = hfspResponse.endpoint;
deployment.status = 'provisioning';
```

In `handleGetDeploymentStatus()`:
```typescript
// Poll HFSP for actual status
const hfspStatus = await getHFSPStatus(deployment.agent_id);
deployment.status = hfspStatus.status;
deployment.logs = hfspStatus.logs || deployment.logs;
// Return updated status to user
```

**Testing**:
```bash
# Set environment
export HFSP_URL="http://localhost:3001"
export HFSP_API_KEY="test-key"

# Call deploy_openclaw_instance
curl http://localhost:3000/tools/deploy_openclaw_instance \
  -H "Content-Type: application/json" \
  -d '{
    "tier_id": "treasury-agent-pro",
    "payment_id": "pay_123",
    "agent_name": "my-treasury",
    "wallet_address": "YOUR_WALLET",
    "region": "us-east"
  }'

# Should return: agent_id, endpoint, status: "provisioning"

# Poll status
curl http://localhost:3000/tools/get_deployment_status \
  -H "Content-Type: application/json" \
  -d '{"deployment_id": "deploy_xyz"}'

# Should return: status transitions from "provisioning" → "running"
```

---

## Deliverables by Friday Morning

### Wednesday (4 hours)
- [ ] Task A: Real Solana verification working
- [ ] Task A: Helius integration tested with devnet transactions
- [ ] Task B: HFSP client created
- [ ] Task B: Wired into deploy_openclaw_instance handler

### Thursday (3 hours)
- [ ] Task A + B: Full integration tested
- [ ] Payment → Deployment flow works end-to-end
- [ ] Status polling works (deployment tracks HFSP state)
- [ ] Error cases handled

### Friday Morning (30 min)
- [ ] Smoke test: list_tiers → quote → verify_payment → deploy → status
- [ ] Ready for demo: Show Claude Code connecting to Clawdrop MCP

---

## What Happens at Friday Demo

**Demo Flow** (with your code):
```
1. Claude Code connects to Clawdrop MCP
2. Claude: "Show me tiers"
   → Uses your tools
3. Claude: "Deploy treasury-agent-pro"
4. Claude calls quote_tier
5. Claude: "Here's the price: 5 SOL"
6. User confirms payment
7. Claude creates Payment record
8. Claude calls verify_payment (YOUR SOLANA CODE)
   → Confirms on-chain
9. Claude calls deploy_openclaw_instance (YOUR HFSP CODE)
   → Agent provisions on Hostinger
10. Claude calls get_deployment_status (YOUR POLLING CODE)
    → Tracks provisioning
11. Agent becomes running
12. Claude: "Your agent is ready at: agent.clawdrop.live/deploy_xyz"
13. User connects Claude Code to the deployed agent's MCP
14. Agent is live and operational
```

**Your code is the backbone of this entire flow.**

---

## Setup & Environment

**Required**:
- Helius RPC endpoint: `https://devnet.helius-rpc.com/`
- HFSP service running locally or remote (you built this)
- HFSP API credentials (ask for them)
- Solana devnet wallet with test SOL

**Environment file** (.env):
```
HELIUS_RPC_URL=https://devnet.helius-rpc.com/
HFSP_URL=http://localhost:3001
HFSP_API_KEY=your-api-key-here
LOG_LEVEL=debug
```

**Local testing**:
```bash
# Terminal 1: Start Clawdrop Control Plane
npm run dev

# Terminal 2: Start HFSP (you already have this)
cd /Users/mac/hfsp-agent-provisioning
npm run dev

# Terminal 3: Test tools
npm run test:tools
```

---

## Common Issues & Fixes

**"HFSP connection refused"**
- Is HFSP running? `ps aux | grep hfsp`
- Check HFSP_URL env var
- Verify port 3001 is open: `lsof -i :3001`

**"Helius RPC timeout"**
- Network issue? Try ping
- Rate limited? Add jitter to requests
- Check devnet status: `curl https://devnet.helius-rpc.com/`

**"Payment verified but deployment fails"**
- Payment ID exists in store?
- Payment status is 'confirmed'?
- HFSP API response has error field?
- Check logs: `npm run logs`

**"Agent status stuck in provisioning"**
- HFSP actually provisioning? Check its logs
- Agent ID valid? Returned from HFSP?
- Polling interval too fast? Use exponential backoff

---

## Success Criteria

✅ **Task A**: Solana verification with real devnet transactions
✅ **Task B**: HFSP deployment creates real agent instances
✅ **Integration**: Payment → Deployment flow is atomic
✅ **Status**: Deployments track real HFSP state
✅ **Errors**: Failures handled gracefully (Payment rejected, Deployment fails)
✅ **Testing**: All three tools tested with curl, logs clean

---

## Communication

**Daily standup** (async):
- What you completed yesterday
- What you're working on today
- Blockers you need help with

**If blocked**:
1. Check logs first
2. Try a fresh build: `npm run build`
3. Test individually (Solana verification alone, HFSP alone)
4. Post in #dev-channel with:
   - What you were doing
   - Error message
   - What you tried
   - Current state

**Success is defined by**:
- Code compiles without warnings
- Real Solana verification works
- HFSP integration provisions real agents
- Friday demo flows end-to-end

---

## Files You'll Modify/Create

Create:
- [ ] `src/integrations/helius.ts` (Solana verification)
- [ ] `src/provisioner/hfsp-client.ts` (HFSP API client)

Modify:
- [ ] `src/server/tools.ts` (wire verification + deployment)
- [ ] `src/db/memory.ts` (ensure Payment/Deployment ops available)
- [ ] `.env.example` (add HFSP credentials)

Reference (read-only):
- [ ] `src/models/payment.ts` (Payment schema)
- [ ] `src/models/deployment.ts` (Deployment schema)
- [ ] `src/contracts/deployment.ts` (Contract interfaces)

---

## You're Building the Foundation of Clawdrop

This isn't just "implement Solana verification." You're enabling:
- Real deployed agents on Hostinger
- Users can actually use them
- Control Plane becomes functional
- Friday demo becomes real

When Friday demo shows deploying an agent, **that's your code running.**

Welcome to the team.
