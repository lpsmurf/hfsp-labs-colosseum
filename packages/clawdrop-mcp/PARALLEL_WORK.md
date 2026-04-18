# Parallel Work While Kimi Implements Phase 1

While Kimi is building Solana verification + HFSP integration (Wed-Fri), here's what can be built in parallel. These tasks don't depend on real Solana/HFSP, just the tool schemas we've already defined.

---

## Priority 1: Friday Demo Foundation (Critical Path)

### 1. MCP Endpoint Setup
**What**: Expose Clawdrop Control Plane as a discoverable MCP in Claude Code

**Status**: Partially done (MCP SDK is integrated, tools defined)

**What's missing**:
- [ ] Verify stdio transport is correctly configured
- [ ] Test MCP connection from Claude Code
- [ ] Ensure all 5 tools are properly exported
- [ ] Create MCP manifest/configuration
- [ ] Add MCP to Claude Code marketplace (or localhost for testing)

**Files to check**:
- `src/server/mcp.ts` - Verify it exports tools correctly
- `src/index.ts` - Main entry point
- `package.json` - Verify MCP SDK dependencies

**Success**: Claude Code can connect, see all 5 tools, call them

---

### 2. Integration Test Suite
**What**: Test all 5 tools end-to-end with mock data

**Status**: Not started

**What to build**:
- [ ] Test: list_tiers returns all 10 tiers with capability bundles
- [ ] Test: quote_tier calculates prices correctly
- [ ] Test: verify_payment handles mock tx_hash (will be updated by Kimi)
- [ ] Test: deploy_openclaw_instance creates valid deployment record
- [ ] Test: get_deployment_status returns correct state
- [ ] Test: Full flow: list → quote → verify → deploy → status

**Create file**: `tests/integration.test.ts`

**Test command**:
```bash
npm test -- integration.test.ts
```

**Success**: All tests pass with mock data, ready for Kimi's real implementations

---

## Priority 2: Web Dashboard Skeleton (Week 2 Ready)

### 3. Web UI Framework
**What**: Create React/Vue skeleton for tier gallery + payment UI

**Status**: Not started

**What to build**:
- [ ] Create `src/web/` directory
- [ ] Setup web build process (Vite or similar)
- [ ] Create tier gallery component
- [ ] Create payment flow component
- [ ] Create deployment status dashboard
- [ ] Wire to same backend (reuse all tools)

**Files to create**:
- `src/web/pages/Tiers.tsx` - Gallery of all tiers
- `src/web/pages/Deploy.tsx` - Deployment flow
- `src/web/pages/Status.tsx` - Deployment status
- `src/web/App.tsx` - Main app

**Success**: Web UI loads, can click through (no backend calls yet)

---

### 4. Web Backend Integration
**What**: HTTP API layer for web dashboard

**Status**: Not started

**What to build**:
- [ ] Create Express.js routes for web
- [ ] GET `/api/tiers` - list all tiers
- [ ] GET `/api/quote/:tierID` - get price quote
- [ ] POST `/api/payment/create` - create payment record
- [ ] POST `/api/payment/verify` - call verify_payment tool
- [ ] POST `/api/deploy` - call deploy_openclaw_instance tool
- [ ] GET `/api/deployment/:id` - call get_deployment_status tool
- [ ] Add CORS for web client

**Create file**: `src/server/api.ts`

**Success**: Web dashboard can call all endpoints (mocked or real)

---

## Priority 3: Terminal CLI Skeleton (Week 2 Ready)

### 5. CLI Tool
**What**: Command-line interface for deployments

**Status**: Not started

**What to build**:
- [ ] Create CLI using Commander.js or similar
- [ ] `clawdrop login` - authenticate
- [ ] `clawdrop list-tiers` - show all tiers
- [ ] `clawdrop quote <tier-id>` - get price
- [ ] `clawdrop deploy <tier-id>` - interactive deployment
- [ ] `clawdrop status <deployment-id>` - check status
- [ ] `clawdrop logs <deployment-id>` - view logs
- [ ] `clawdrop ssh <deployment-id>` - SSH into VPS

**Create file**: `src/cli/index.ts`

**Success**: CLI can list tiers, take deployments (all operations work)

---

## Priority 4: Database Schema (Week 2 Foundation)

### 6. PostgreSQL Migration Scripts
**What**: Define database schema for persistence layer

**Status**: Not started

**What to build**:
- [ ] Create `migrations/` directory
- [ ] Migration 001: Create `tiers` table
- [ ] Migration 002: Create `payments` table
- [ ] Migration 003: Create `deployments` table
- [ ] Add indexes for common queries
- [ ] Add constraints and validations
- [ ] Create seed data script

**Example migration**:
```sql
CREATE TABLE tiers (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  category VARCHAR,
  capability_bundle VARCHAR,
  features JSON,
  price_sol DECIMAL,
  price_herd DECIMAL,
  deployment_type VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Success**: Schema matches in-memory models, migrations are ready

---

## Priority 5: Testing & Quality

### 7. Error Handling & Validation Tests
**What**: Comprehensive error scenario testing

**Create file**: `tests/error-handling.test.ts`

**Test scenarios**:
- [ ] Invalid tier ID
- [ ] Missing payment before deployment
- [ ] Failed Solana verification (will be real Fri)
- [ ] HFSP provisioning timeout (will be real Fri)
- [ ] Malformed requests
- [ ] Rate limiting
- [ ] Concurrent deployments

**Success**: All error paths tested, proper error messages

---

### 8. Load Testing
**What**: Ensure system can handle scale

**Create file**: `tests/load.test.ts`

**Test scenarios**:
- [ ] 100 concurrent tier listings
- [ ] 50 concurrent quotes
- [ ] 10 concurrent deployments
- [ ] Memory usage under load
- [ ] Response times acceptable

**Success**: System handles expected load, no crashes

---

## Priority 6: Documentation

### 9. Deployed Agent Documentation
**What**: Guide for users who have deployed agents

**Create file**: `docs/AGENT_USAGE.md`

**Sections**:
- [ ] What is your deployed agent?
- [ ] How to connect Claude Code to it
- [ ] How to SSH into the VPS
- [ ] Available tools and capabilities
- [ ] Customization options
- [ ] Updating/upgrading agent
- [ ] Troubleshooting
- [ ] Attaching external MCPs (Solana, etc.)

**Success**: Users know how to use deployed agents

---

### 10. API Documentation
**What**: OpenAPI/Swagger docs for backend

**Create file**: `docs/API.md`

**Document**:
- [ ] All 5 tool endpoints
- [ ] Request/response schemas
- [ ] Error codes
- [ ] Rate limits
- [ ] Authentication (if needed)
- [ ] Example curl commands

**Success**: Developers can integrate with Clawdrop API

---

## Timeline: What to Build When

### Wednesday (while Kimi does Task A)
- **Do**: MCP endpoint setup + verification
- **Do**: Integration test suite (with mocks)
- **Do**: Web UI skeleton
- **Result**: Can verify MCP is working before Solana code arrives

### Thursday (while Kimi does Task B)
- **Do**: Web backend integration
- **Do**: CLI skeleton
- **Do**: Database schema
- **Result**: All three clients scaffolded, ready for real backends

### Friday Morning (before demo)
- **Do**: Error handling tests
- **Do**: Final integration test
- **Do**: Documentation polish
- **Result**: Demo ready with complete system

### Friday Afternoon (after demo)
- **Do**: Code review of Kimi's work
- **Do**: Merge Solana + HFSP into main
- **Result**: Production-ready Phase 1

---

## Dependency Map

```
Kimi's Phase 1 Work
├─ Task A: Solana verification
│  └─ Consumed by: verify_payment tool
│
└─ Task B: HFSP integration
   └─ Consumed by: deploy_openclaw_instance tool

Your Parallel Work
├─ MCP Endpoint (✅ doesn't depend on Kimi)
├─ Integration Tests (✅ uses mocks for Kimi's code)
├─ Web UI (✅ doesn't depend on Kimi)
├─ Web API (✅ same tool calls, mocked first)
├─ CLI (✅ same tool calls, mocked first)
└─ Database (✅ doesn't depend on Kimi)

Friday Demo
├─ Requires: MCP endpoint ✅ (you build)
├─ Requires: Solana verification ✅ (Kimi builds)
└─ Requires: HFSP integration ✅ (Kimi builds)
```

---

## Success Metrics by Friday

**By Friday 2pm**:
- ✅ MCP endpoint works in Claude Code
- ✅ All 5 tools callable with mocks
- ✅ Web dashboard scaffold complete
- ✅ CLI skeleton complete
- ✅ Database schema ready
- ✅ Error handling tested

**By Friday 5pm**:
- ✅ Solana verification working (Kimi's code)
- ✅ HFSP integration working (Kimi's code)
- ✅ Full demo ready end-to-end

---

## Commit Strategy

Keep work separated:
```
YOUR COMMITS:
- "Add MCP endpoint setup and verification"
- "Add integration test suite with mocks"
- "Add web dashboard skeleton"
- "Add CLI tool skeleton"
- "Add PostgreSQL migration scripts"
- "Add comprehensive error handling tests"

KIMI'S COMMITS:
- "Add real Solana verification via Helius RPC"
- "Add HFSP provisioning integration"

MERGE ON FRIDAY:
- "Merge Phase 1: Real Solana + HFSP integration"
- "Merge infrastructure: MCP + Web + CLI scaffolds"
```

---

This ensures:
1. Your work doesn't block Kimi
2. Kimi's work doesn't block you
3. Everything integrates Friday for demo
4. Clean commit history for Week 2
