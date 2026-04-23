# HFSP Provisioning Engine - 4-Agent Repair Plan
**Timeline**: 2-3 days  
**Status**: Ready to distribute  

---

## AGENT ALLOCATION

### CLAUDE (Minimal - Token Budget Low)
**Role**: Review/guidance only  
**Effort**: ~2 hours total

- [ ] Create this task distribution doc
- [ ] Review each agent's PR for correctness
- [ ] Merge PRs in correct order (Stream 1 → 2 → 3 → 4)
- [ ] Test integration at end

**Token Budget**: 5-10K (review comments only, no coding)

---

### CODEX — STREAM 1: Validation & Schema (2-3 hours)
**Branch**: Work on main (or `feature/codex/provisioning-validation`)  
**Deliverable**: Schema validation + telegram token validation  
**PR Merge**: Immediate (no blockers)

#### Tasks:

**Task 1.1: Make Telegram Token Required** (15 min)
- File: `/packages/clawdrop-mcp/src/server/schemas.ts`
- Change: `telegram_token` from optional → required with regex validation
- Test: Call deploy_agent without token → 400 response

**Task 1.2: Validate Token Before Payment** (45 min)
- File: `/packages/clawdrop-mcp/src/server/tools.ts` — `handleDeployAgent()`
- Add: `validateTelegramToken()` function
- Call it BEFORE payment processing
- Test: Deploy with invalid token → rejected before payment

**Task 1.3: Input Sanitization** (30 min)
- File: `/packages/clawdrop-mcp/src/server/tools.ts`
- Add: `.trim()` on all inputs at start of handleDeployAgent()
- Test: Deploy with whitespace in inputs → works correctly

**Acceptance Criteria**:
✓ Schema rejects missing telegram_token  
✓ Error messages are clear  
✓ Token validated before payment  
✓ Whitespace handled correctly  

**PR Template**:
```
## Stream 1: Telegram Validation & Input Sanitization
- [x] Task 1.1: Telegram token required
- [x] Task 1.2: Token validation before payment
- [x] Task 1.3: Input sanitization
- [x] All tests pass
- [x] No console errors
```

---

### GEMINI — STREAM 2: Database & Idempotency (5-6 hours)
**Branch**: `feature/gemini/provisioning-db`  
**Dependency**: Waits for Stream 1 to merge  
**Deliverable**: SQLite DB + idempotency keys + atomic tier limits  
**PR Merge**: After Codex merges

#### Tasks:

**Task 2.1: Migrate memory.ts → SQLite** (2-3 hours)
- File: Create `/packages/clawdrop-mcp/src/db/sqlite.ts`
- Install: `npm install better-sqlite3`
- Implement: Full CRUD operations for agents table
- Schema: agents table with idempotency_key, tier_id, wallet_address, status
- Indexes: idx_wallet_tier, idx_status
- Test: Data persists after restart

**Task 2.2: Add Idempotency Keys** (1.5-2 hours)
- File: `/packages/clawdrop-mcp/src/server/tools.ts`
- Add: Idempotency key check at start of handleDeployAgent()
- Logic: Same key → return existing deployment_id
- Test: Call twice with same idempotency_key → no duplicates

**Task 2.3: Atomic Tier Limit Enforcement** (1.5-2 hours)
- File: `/packages/clawdrop-mcp/src/db/sqlite.ts` + tools.ts
- Add: `checkAndIncrementTierCount()` function
- Implement: DB transaction to prevent race conditions
- Test: 2 concurrent requests same wallet → only 1 succeeds

**Acceptance Criteria**:
✓ Database file created on startup  
✓ Agents persist after restart  
✓ Same idempotency_key returns same deployment_id  
✓ Tier limits enforced under concurrent load  

**PR Template**:
```
## Stream 2: Database Migration & Idempotency
- [x] Task 2.1: SQLite migration
- [x] Task 2.2: Idempotency keys
- [x] Task 2.3: Atomic tier limits
- [x] Database tests pass
- [x] No data loss on restart
```

---

### KIMI — STREAM 3 & 4: Polling + Observability (7-9 hours)
**Branch**: `feature/kimi/provisioning-reliability`  
**Dependency**: Waits for Stream 2 (uses DB layer)  
**Deliverable**: Polling refactor + health checks + logging + rate limiting  
**PR Merge**: After Gemini merges

#### STREAM 3 Tasks (4-5 hours):

**Task 3.1: Exponential Backoff + Circuit Breaker** (2-3 hours)
- File: `/packages/clawdrop-mcp/src/server/tools.ts` — replace `waitForAgentReady()`
- Backoff: Fibonacci sequence [3, 5, 8, 13, 21, 34, 55, 89]
- Circuit breaker: Fail after 5 consecutive failures
- Error classification: permanent (4xx) vs transient (5xx) vs network
- Test: Mock HFSP 500 → retries with backoff, fails after 5 attempts

**Task 3.2: Health Checks** (1.5 hours)
- File: Create `/packages/clawdrop-mcp/src/server/health.ts`
- Check: HFSP health, Solana RPC health, Database health
- Call: BEFORE payment in handleDeployAgent()
- Test: Mock HFSP down → deployment rejected with clear error

**Task 3.3: Error Classification** (1-1.5 hours)
- File: Create `/packages/clawdrop-mcp/src/utils/errors.ts`
- Create: HFSPError class with error_type (transient/permanent/unknown)
- Implement: classifyError() function for all error types
- Test: 400 → permanent, 500 → transient, network error → transient

#### STREAM 4 Tasks (3-4 hours):

**Task 4.1: Structured Logging + Correlation IDs** (1.5-2 hours)
- File: Create `/packages/clawdrop-mcp/src/utils/logger.ts`
- Implement: Pino logger with correlation_id tracking
- Add to handleDeployAgent(): correlation_id on every log
- Test: grep logs by correlation_id → trace full deployment flow

**Task 4.2: Per-Wallet Rate Limiting** (1-1.5 hours)
- File: `/packages/clawdrop-mcp/src/db/sqlite.ts` + tools.ts
- Add: deployment_attempts table to track per-wallet attempts
- Enforce: Max 5 deployments per hour per wallet
- Test: Deploy 6x in 1 hour → 6th fails with rate limit error

**Task 4.3: Fallback RPC Endpoints** (1-1.5 hours)
- File: Create `/packages/clawdrop-mcp/src/integrations/solana.ts`
- Implement: verifyPaymentWithFallback() with 3 RPC endpoints
- Primary: HELIUS_RPC_URL, Secondary: mainnet-beta, Tertiary: ProjectSerum
- Test: Mock primary down → uses secondary, succeeds

**Acceptance Criteria (Stream 3 & 4)**:
✓ Polling uses exponential backoff (3, 5, 8, 13...)  
✓ Circuit breaker triggers after 5 failures  
✓ 400/404 fail immediately, 500 retries  
✓ Health check runs before payment  
✓ All logs include correlation_id  
✓ Rate limiting blocks 6th deployment in 1 hour  
✓ Fallback RPC works when primary fails  

**PR Template**:
```
## Stream 3 & 4: Polling Reliability + Observability
- [x] Task 3.1: Exponential backoff + circuit breaker
- [x] Task 3.2: Health checks (HFSP, Solana, DB)
- [x] Task 3.3: Error classification
- [x] Task 4.1: Structured logging + correlation IDs
- [x] Task 4.2: Rate limiting (5/hour/wallet)
- [x] Task 4.3: Fallback RPC endpoints
- [x] All integration tests pass
- [x] No console errors
```

---

## MERGE SEQUENCE

**Day 1** (Today):
1. Codex completes Stream 1 ✓
2. Claude merges Stream 1
3. Gemini starts Stream 2

**Day 2**:
1. Gemini completes Stream 2
2. Claude merges Stream 2
3. Kimi starts Streams 3 & 4

**Day 3**:
1. Kimi completes Streams 3 & 4
2. Claude merges Streams 3 & 4
3. Claude runs full integration test
4. Deploy to staging

---

## TESTING CHECKLIST

**Stream 1** (Codex):
- [ ] Missing telegram_token → 400 error
- [ ] Invalid telegram_token → rejected before payment
- [ ] Valid token → proceeds
- [ ] Whitespace in inputs → trimmed correctly

**Stream 2** (Gemini):
- [ ] Database file created on startup
- [ ] Agents table has correct schema
- [ ] Data persists after service restart
- [ ] Same idempotency_key → same deployment_id
- [ ] Concurrent tier limit requests → only 1 succeeds

**Stream 3 & 4** (Kimi):
- [ ] Polling backoff: 3s, 5s, 8s, 13s, ...
- [ ] Circuit breaker after 5 failures
- [ ] 400/404 → fail immediately
- [ ] 500 → retry with backoff
- [ ] Network error → retry with backoff
- [ ] Health check blocks unhealthy deployments
- [ ] All logs have correlation_id
- [ ] Rate limiting: 6th deployment/hour → fails
- [ ] Primary RPC down → uses secondary

---

## FILE SUMMARY

| Stream | Files Created | Files Modified |
|--------|---------------|----------------|
| **1 (Codex)** | — | schemas.ts, tools.ts |
| **2 (Gemini)** | sqlite.ts | tools.ts |
| **3 & 4 (Kimi)** | health.ts, errors.ts, logger.ts, solana.ts | tools.ts, sqlite.ts |

**Total New Files**: 4  
**Total Modified Files**: 3  
**Lines of Code**: ~1,200-1,500 (distributed)

---

## Success Criteria (End of Day 3)

- [ ] All 4 streams merged to main
- [ ] No integration test failures
- [ ] No console errors in logs
- [ ] Deployments work end-to-end:
  - [ ] Valid token
  - [ ] Invalid token rejected before payment
  - [ ] Tier limits enforced
  - [ ] Polling works with backoff
  - [ ] Health checks prevent unhealthy deployments
  - [ ] Logs include correlation IDs
  - [ ] Rate limiting works
  - [ ] Fallback RPC works
- [ ] Ready to deploy to staging

---

## Questions?

- Architecture/integration → Claude
- Stream-specific → Ask relevant agent
- Blockers → Tell Claude immediately

**DO NOT** wait for responses — start coding async, Claude will catch up.
