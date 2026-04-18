# Phase Alignment: Foundation → Functionality → Demo

## Executive Summary

Clawdrop is an **MCP Gateway Hub** (like Docker Hub for MCPs). Users discover and connect to Clawdrop in Claude Code, and manage crypto agent deployments with tier selection, Solana payments, and HFSP provisioning.

**Three entry points** coming in order:
1. **Claude Code** (Priority 1) - Direct MCP connection → Friday demo
2. **Terminal CLI** (Priority 2) - Shell workflow → Week 2
3. **Web Dashboard** (Priority 3) - Browser UI → Week 2

---

## Phase 0: Foundation Layer ✅ COMPLETE

**Completed**: Yesterday

**What was built**:
- Data models: Tier, Payment, Deployment
- Contract interfaces: DeploymentRequest/Response, ProvisionerStatus
- In-memory store: Deployments, Payments (with separate tracking)
- Tool schemas: list_tiers, quote_tier, verify_payment, deploy_openclaw_instance, get_deployment_status
- Tier catalog: 10 tiers with capability bundles
- Code compiles successfully

**Why it matters**: This is the backend API that all three clients (Claude Code, web, CLI) will call. Same backend, different frontends.

**Status**: Ready for Phase 1 ✅

---

## Phase 1: Wire Real Backends (Tomorrow, 6 hours)

**Team**: Kimi (implementation), You (reviews)

### Task A: Solana Payment Verification (4 hours)

**Current**: Payment stub that accepts any tx_hash
```typescript
const confirmed = parsed.tx_hash && parsed.tx_hash.length > 0; // ❌ Fake
```

**Target**: Real Helius RPC verification
```typescript
const confirmed = await verifyHeliusTransaction(parsed.tx_hash); // ✅ Real devnet check
```

**File**: `src/integrations/helius.ts`

**Kimi deliverable**:
- [ ] verifyHeliusTransaction() implementation
- [ ] Real Helius API calls to devnet
- [ ] Handles confirmed/finalized status
- [ ] Error handling for timeout/failure
- [ ] Tested with real devnet transactions

**Success**: `verify_payment` tool actually checks on-chain state

---

### Task B: HFSP Integration (3 hours)

**Current**: Deployment created locally only
```typescript
saveDeployment(deployment); // ❌ Only in-memory
```

**Target**: Call HFSP API to provision real Docker container
```typescript
const response = await deployViaHFSP(deploymentRequest); // ✅ Real provisioning
```

**Files**:
- Create: `src/provisioner/hfsp-client.ts`
- Modify: `src/server/tools.ts` (handleDeployOpenclawInstance, handleGetDeploymentStatus)

**Kimi deliverable**:
- [ ] deployViaHFSP() makes HTTP call to HFSP API
- [ ] Passes deployment_id, tier_id, capability_bundle, payment_verified
- [ ] Returns agent_id, endpoint, status
- [ ] getHFSPStatus() polls HFSP for deployment state
- [ ] Integration in deploy_openclaw_instance handler
- [ ] Status tracking in get_deployment_status handler
- [ ] Tested with HFSP running locally

**Success**: `deploy_openclaw_instance` tool actually provisions agents on Hostinger

---

### Combined Success Criteria

After Phase 1:
- ✅ User can select tier, get quote (no Solana verification yet needed)
- ✅ User provides payment tx_hash (real devnet confirmation)
- ✅ Payment is verified on-chain (Kimi's Task A)
- ✅ Deployment triggers HFSP provisioning (Kimi's Task B)
- ✅ Agent appears on Hostinger VPS
- ✅ Status polling returns real state (provisioning → running)
- ✅ User receives endpoint to their running agent

**Code quality**:
- Compiles without warnings
- All imports resolved
- Error handling covers failures (bad tx, HFSP timeout, etc.)
- Logging covers full flow
- No mock data in live paths

---

## Phase 2: Demo Ready (Friday, 2 hours)

**Team**: You (orchestration) + Kimi (review)

### What stays the same
- Phase 0 foundation ✅
- Phase 1 Solana + HFSP ✅
- All tool schemas ✅

### What's added
- MCP endpoint exposed for Claude Code
- Claude Code integration test
- Demo script walkthrough
- Live deployment from tier → endpoint

### Deliverables

**1. MCP Endpoint** (30 min)
- Clawdrop Control Plane exposes tools as real MCP
- Claude Code can connect and call tools
- File: `src/server/mcp.ts` (already exists, just verify it exports tools correctly)

**2. Test Suite** (45 min)
- Test: list_tiers → returns all tiers
- Test: quote_tier → returns pricing
- Test: verify_payment → confirms devnet tx
- Test: deploy_openclaw_instance → provisions via HFSP
- Test: get_deployment_status → tracks real state

**3. Demo Script** (45 min)
- Full walkthrough: tier selection → payment → deployment
- Show console output at each step
- Show deployed agent endpoint
- Timing: ~8 minutes for full demo

---

## Week 2: Scale Phase (Post-Friday)

These are next week's work, NOT required for Friday demo:

**Web Dashboard Client** (2 days)
- Tier gallery UI
- Payment flow UI
- Status dashboard
- Same backend (reuses all Phase 1 tools)

**Terminal CLI Client** (2 days)
- `clawdrop list-tiers`
- `clawdrop deploy tier-id`
- `clawdrop status deploy-id`
- Same backend (reuses all Phase 1 tools)

**Persistence Layer** (1 day)
- PostgreSQL backend
- Replace in-memory store
- Schema migration
- Connection pooling

---

## Architecture Validation Checklist

- [x] Clawdrop is MCP Gateway (Docker Hub for MCPs)
- [x] Three entry points: Claude Code (Priority 1), CLI (Priority 2), Web (Priority 3)
- [x] Phase 0 foundation complete and correct
- [x] Phase 1 focused on real Solana + real HFSP
- [x] Phase 2 is integration + demo (not new architecture)
- [x] All three clients call same backend
- [x] Post-deployment: MCP endpoint + SSH access
- [x] Friday demo shows complete tier → payment → deployment flow

---

## Risk Management

**If Solana verification fails by Friday**:
- Use mock tx_hash acceptance for demo
- Show the code path, explain delay
- Continue with HFSP provisioning
- Fix Thursday evening, re-test Friday morning

**If HFSP provisioning fails by Friday**:
- Mock successful deployment for demo
- Show HFSP code is wired correctly
- Continue with status polling
- Fix Thursday evening, re-test Friday morning

**If both fail**:
- Demo shows full architecture (tools, data models, contracts)
- Explain "real payment verification coming tomorrow"
- Explain "real provisioning via HFSP coming tomorrow"
- Frame as "foundation is battle-tested, backends being wired"

**If all succeeds**:
- Friday demo shows real end-to-end flow
- User selects tier → pays SOL → agent deploys → agent runs
- Sets foundation for Week 2 clients

---

## Commit History (What Kimi will create)

```
Wed: "Add real Solana verification via Helius RPC"
     - src/integrations/helius.ts: verifyHeliusTransaction()
     - tests: Helius integration tests

Wed: "Add HFSP provisioning integration"
     - src/provisioner/hfsp-client.ts: deployViaHFSP(), getHFSPStatus()
     - src/server/tools.ts: Wire HFSP calls into handlers
     - tests: HFSP integration tests

Thu: "Full integration: payment → provisioning → status"
     - All three tools wired together
     - Error handling complete
     - Logging comprehensive

Fri: "Demo ready: Clawdrop MCP Gateway live"
     - MCP endpoint tested
     - End-to-end test passing
     - Demo script ready
```

---

## Success Metrics

**By Friday 5pm**:
- ✅ Clawdrop Control Plane accepts Solana payments (real verification)
- ✅ HFSP provisioning wired and tested
- ✅ Deployments track real agent state
- ✅ Claude Code connects to MCP and calls tools
- ✅ User can select tier → pay SOL → get deployed agent
- ✅ Demo script completes without manual intervention

**Outcome**: Clawdrop has real payment flow + real provisioning. Foundation for three clients to be built next week.

---

This alignment confirms Phase 0-1-2 as designed is correct.
