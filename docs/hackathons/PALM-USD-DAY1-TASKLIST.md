# Palm USD Hackathon - Day 1 Task Distribution

**Status**: Feature branches ready  
**Deadline**: End of Day 1 (24 hours)  

---

## CLAUDE (Minimal - Tokens Low)
**Branch**: `feature/claude/palm-usd-integration`  
**Role**: Architecture lead (guidance only)  

### Tasks:
- [x] Create feature branches for all 4 agents
- [x] Define PUSD types (pusd.ts with Zod schemas)
- [x] Create treasury OpenAPI spec
- [ ] Create task coordination doc (this file)
- [ ] Merge all PRs at end of day

**Token Budget**: ~5-10K (setup only)

---

## CODEX (Phase 1 Audit)
**Branch**: `feature/codex/code-audit`  
**Role**: Security & quality auditor  

### Tasks (Days 1-3, Parallel):

**Task 1: Audit Manifest Schema** (45 min)
- File: `packages/agent-provisioning/services/agent-brain/src/types/manifest.ts`
- Check: Zod validation completeness, edge cases, serialization safety
- Output: Create `CODEX-AUDIT-MANIFEST.md` with findings
- Deliverable: PR with suggested fixes

**Task 2: Audit Mastra Agent Service** (45 min)
- File: `packages/agent-provisioning/services/agent-brain/src/services/mastra-agent.ts`
- Check: Agent initialization, system prompt injection safety, skill registration
- Output: Create `CODEX-AUDIT-MASTRA.md` with security assessment
- Deliverable: PR with hardening suggestions

**Task 3: Audit Message Handler** (30 min)
- File: `packages/agent-provisioning/services/agent-brain/src/handlers/message.ts`
- Check: Input validation, error handling, timeout safety, response formatting
- Output: Create `CODEX-AUDIT-MESSAGE.md`
- Deliverable: PR with fixes

**Task 4: Audit HTTP Security** (30 min)
- File: `packages/agent-provisioning/services/agent-brain/src/index.ts`
- Check: CORS, rate limiting, middleware order, error responses, PII logging
- Output: Create `CODEX-AUDIT-HTTP.md`
- Deliverable: PR with middleware fixes

**Task 5: Audit Dockerfile** (20 min)
- File: `packages/agent-provisioning/services/agent-brain/Dockerfile`
- Check: Base image vulnerabilities, multi-stage efficiency, layer caching, permissions
- Output: Create `CODEX-AUDIT-DOCKERFILE.md`
- Deliverable: PR with hardened Dockerfile

**Merge Gate**: Claude reviews for completeness, merges by end of Day 3

---

## GEMINI (Treasury Service)
**Branch**: `feature/gemini/pusd-treasury-service`  
**Role**: PUSD data access layer  

### Tasks (Days 1-4):

**Task 1: Create PUSD Client** (2 hours)
- File: `packages/agent-provisioning/services/agent-brain/src/services/pusd-client.ts`
- Features:
  - Query Solana RPC for PUSD token account balance
  - Fetch transaction history from chain
  - Parse SPL token metadata
  - Handle RPC rate limiting (cache 5 min)
- Acceptance: Returns `PusdBalance` from pusd.ts schema

**Task 2: Create Treasury Handlers** (1.5 hours)
- File: `packages/agent-provisioning/services/agent-brain/src/handlers/treasury.ts`
- Endpoints:
  - GET `/api/v1/treasury/balance` → calls pusd-client
  - GET `/api/v1/treasury/history` → paginated tx list
  - GET `/api/v1/treasury/analytics` → spending by category
- Acceptance: Matches OpenAPI spec in docs/TREASURY-ENDPOINTS.openapi.yaml

**Task 3: Integrate into Message Handler** (1 hour)
- File: Update `packages/agent-provisioning/services/agent-brain/src/handlers/message.ts`
- When user asks "What's our treasury balance?", call treasury service
- Format response for Telegram display
- Add error handling for invalid DAO addresses

**Task 4: Add Agent Skills** (1 hour)
- File: `packages/agent-provisioning/services/agent-brain/src/services/mastra-agent.ts`
- Register skills: `check_treasury_balance`, `get_transaction_history`, `analyze_spending`
- Mastra agent can autonomously call these
- Acceptance: Agent can reason about treasury queries

**Merge Gate**: Claude reviews for API contract match, merges by Day 6

---

## KIMI (Transfer Execution & Deployment)
**Branch**: `feature/kimi/pusd-transfers-deployment`  
**Role**: PUSD transfers + VPS deployment  

### Tasks (Days 1-4):

**Task 1: Create PUSD Transferor Service** (1.5 hours)
- File: `packages/agent-provisioning/services/agent-brain/src/services/pusd-transferor.ts`
- Features:
  - Build SPL token transfer transaction
  - Integrate Turnkey wallet policy engine
  - Sign transaction with agent wallet
  - Broadcast to Solana RPC
  - Return tx hash + explorer URL
- Acceptance: Returns `TransferResponse` from pusd.ts schema

**Task 2: Create Transfer Handlers** (1.5 hours)
- File: `packages/agent-provisioning/services/agent-brain/src/handlers/transfers.ts`
- Endpoint: POST `/api/v1/treasury/transfer`
- Verify spending policy before execution
- Log all transfers for audit trail
- Queue approval request if needed
- Acceptance: Matches OpenAPI spec

**Task 3: Add Agent Skill** (1 hour)
- File: Update `packages/agent-provisioning/services/agent-brain/src/services/mastra-agent.ts`
- Register skill: `execute_pusd_transfer(amount, recipient, reason)`
- Agent can autonomously execute transfers within policy
- Requires approval if amount > threshold

**Task 4: VPS Deployment Script** (1 hour)
- File: Create `deployment/deploy-pusd-agent.sh`
- Pull latest code
- Build Docker image
- Update docker-compose.yml with PUSD env vars
- Restart agent-brain service
- Verify health check passes
- Acceptance: One-command deployment to 72.62.239.63

**Task 5: Deployment Documentation** (30 min)
- File: Create `docs/VPS-SETUP-GUIDE.md`
- Instructions for deploying to production VPS
- Env var requirements (PUSD_TOKEN_MINT, DAO_WALLET, etc.)
- Acceptance: Non-technical user can follow guide

**Merge Gate**: Claude reviews for security + policy enforcement, merges by Day 6

---

## GitHub PR Template (All Agents)

When pushing PRs, use this format:

```
## Summary
[1-2 sentence description of what this PR does]

## Changes
- [ ] Task 1 from task list above
- [ ] Task 2
- [ ] etc.

## Testing
- [ ] Unit tests pass
- [ ] Integration test against devnet
- [ ] No console errors
- [ ] API endpoints match OpenAPI spec

## Checklist
- [ ] Code reviewed by agent (self-review)
- [ ] Types match pusd.ts schemas
- [ ] Error messages are user-friendly
- [ ] No secrets committed (.env, API keys)
```

---

## Merge Schedule

| Day | Task | Merged By |
|-----|------|-----------|
| 1 | Feature branches created | Claude |
| 2-3 | Parallel development | All agents |
| 3 | Codex Phase 1 audit | Claude |
| 6 | Codex audit fixes | Claude |
| 6 | Gemini treasury service | Claude |
| 6 | Kimi transfer executor | Claude |
| 7 | Integration test | Claude |

---

## Success Criteria (End of Day 1)

- [ ] All 4 feature branches exist and tracked on GitHub
- [ ] PUSD types defined in pusd.ts (Zod schemas)
- [ ] OpenAPI spec complete in docs/TREASURY-ENDPOINTS.openapi.yaml
- [ ] Task list (this doc) pushed to main
- [ ] Each agent has clear acceptance criteria for their PRs
- [ ] All agents know their tasks + deadlines

---

## Slack/Chat Check-in Points

- **EOD Day 1**: Confirm all agents have tasks + branches ready
- **EOD Day 2**: Progress update (% complete on each stream)
- **EOD Day 3**: Codex audit findings, merge Phase 1 if no blockers
- **EOD Day 4**: Gemini + Kimi code complete, Claude integrates
- **EOD Day 5**: Integration testing begins
- **EOD Day 6**: All PRs merged, demo DAO ready

---

## Questions? Ask Claude

- Architecture questions → Claude
- Type/schema questions → Claude  
- Integration questions → Claude
- Merge blockers → Claude

**DO NOT** wait for response; start coding — Claude will catch up async.
