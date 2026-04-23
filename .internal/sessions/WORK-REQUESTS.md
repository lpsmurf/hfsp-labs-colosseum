# 🚨 URGENT: HFSP Provisioning Repair - Agent Work Requests

**STATUS**: Ready to start NOW  
**PRIORITY**: Critical path for production  
**TIMELINE**: Complete by end of Day 3  

---

## ⚠️ CODEX - START NOW

**Task**: Stream 1 - Telegram Validation (2-3 hours)  
**Files Modified**: 
- `packages/clawdrop-mcp/src/server/schemas.ts`
- `packages/clawdrop-mcp/src/server/tools.ts`

**What Claude did**:
- Made `telegram_token` required in schema ✓
- Added regex validation ✓
- Added `validateTelegramToken()` function ✓
- Added input sanitization ✓

**Your job**: Test it
- [ ] Missing telegram_token → 400 error
- [ ] Invalid token format → rejected before payment
- [ ] Valid token → proceeds normally
- [ ] Whitespace handled correctly

**Then**: Create PR, request Claude review

---

## ⚠️ GEMINI - START AFTER CODEX MERGES

**Task**: Stream 2 - Database & Idempotency (5-6 hours)  
**File**: `packages/clawdrop-mcp/src/db/sqlite.ts`

**Stubs waiting for you**:
- `saveAgent()` — INSERT new agent
- `getAgentByIdempotencyKey()` — Find by idem key (Task 2.2)
- `checkAndIncrementTierCount()` — Atomic tier limit (Task 2.3)

**Tasks**:
- [ ] Task 2.1: Complete SQLite CRUD (saveAgent, getAgent, updateAgentStatus, etc.)
- [ ] Task 2.2: Implement idempotency key lookup
- [ ] Task 2.3: Atomic tier limit with db.transaction()

**Then**: Create PR, wait for Claude to merge Stream 1 first

---

## ⚠️ KIMI - START AFTER GEMINI MERGES

**Tasks**: Streams 3 & 4 (7-9 hours)  
**Files**:
- `packages/clawdrop-mcp/src/server/health.ts` — Health checks (Task 3.2)
- `packages/clawdrop-mcp/src/utils/errors.ts` — Error classification (Task 3.3)
- `packages/clawdrop-mcp/src/utils/logger.ts` — Structured logging (Task 4.1)
- `packages/clawdrop-mcp/src/integrations/solana.ts` — RPC fallback (Task 4.3)

**Stream 3 Tasks**:
- [ ] Task 3.1: Exponential backoff + circuit breaker in `waitForAgentReady()`
- [ ] Task 3.2: Health checks (HFSP, Solana RPC, Database)
- [ ] Task 3.3: Error classification (transient vs permanent)

**Stream 4 Tasks**:
- [ ] Task 4.1: Correlation IDs in logs
- [ ] Task 4.2: Rate limiting (5 deployments/hour/wallet)
- [ ] Task 4.3: Fallback RPC endpoints (3 endpoints with retry)

**Then**: Create PR, wait for Claude to merge Stream 2 first

---

## 📋 Reference

Full task details: `docs/HFSP-PROVISIONING-REPAIR-TASKPLAN.md`

Merge order:
1. Codex (Stream 1) — no blockers
2. Gemini (Stream 2) — after Codex
3. Kimi (Streams 3 & 4) — after Gemini
4. Claude (final review + integration test)

---

## ⏰ Timeline

- **TODAY (Day 1)**: Codex completes Stream 1
- **Day 2**: Gemini completes Stream 2, Codex merges
- **Day 3**: Kimi completes Streams 3 & 4, Gemini merges, Kimi merges
- **Day 3 EOD**: Claude tests integration, deploy to staging

---

**Questions?** Check `docs/HFSP-PROVISIONING-REPAIR-TASKPLAN.md` for full acceptance criteria.

**Start coding NOW** ↓↓↓
