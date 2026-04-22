# Palm USD Hackathon Strategy - Autonomous Treasury Management Agent

**Status**: Planning (Start after Milestone 5)  
**Target Submission**: 14 days post-kickoff  
**Prize Target**: 1st Place (5,000 PUSD)  
**Hackathon**: Frontier Hackathon - PUSD Track

---

## 📋 Executive Summary

**Project**: Autonomous Treasury Management Agent for DAOs using PUSD  
**Value Proposition**: First AI agent with built-in spending accountability that autonomously manages DAO treasuries in PUSD  
**Competitive Advantage**: Self-manifest system enables agents to know and enforce their own spending limits without centralized oversight

---

## 🎯 Strategic Positioning

### The Problem
DAOs need autonomous treasury management but face trust challenges:
- Multi-sig coordination is slow and expensive
- Delegating to individuals creates single-point-of-failure risk
- Existing automation tools lack accountability mechanisms
- Need stable reserves (PUSD) but no autonomous management tools

### Our Solution
**Clawdrop Autonomous Agent** with:
- Self-manifest JSON: Agent knows its name, wallet, balance, spending limits
- Mastra orchestration: Reasons about decisions, calls appropriate tools
- Turnkey wallet: Enforces spending policies without human override needed
- PUSD integration: Manages DAO treasury in stablecoin, not volatile assets

### Why We Win (Judging Criteria)

| Criterion | Score | Why |
|-----------|-------|-----|
| Technical Execution (35%) | 35/35 | Shipped Mastra + agent-brain architecture. Self-manifest is novel. Clean code. |
| Product & Use Case (30%) | 29/30 | DAOs = multi-billion market. Clear problem + user base. PUSD integration natural. |
| Innovation (15%) | 15/15 | First AI agent with autonomous accountability. No competitors in this space. |
| Traction (10%) | 9/10 | Live demo with test DAO. Real PUSD transactions. Telegram integration. |
| Team Execution (10%) | 10/10 | Shipped Milestone 1 in days. Can ship Milestone 2 + PUSD in 14 days. |
| **TOTAL** | **98/100** | Highest technical score, clear product fit, proven execution |

---

## 🏗️ Technical Architecture

### Current State (Milestone 1 - Complete)
```
agent-brain (Express server on port 3334)
├── Self-manifest system (Zod validation)
├── Mastra integration (agent orchestration)
├── Spending policy enforcement (per-tx, daily, approval thresholds)
├── Message handling (user input → agent reasoning → response)
└── HTTP API (/initialize, /message, /status, /manifest, /health)
```

### Hackathon Addition (PUSD Integration)
```
agent-brain (extended)
├── PUSD token queries (balance, transaction history, token metadata)
├── SPL token transfers (route through Turnkey wallet)
├── Treasury analytics (spending by category, approval rate, policy violations)
├── DAO governance queries (member count, voting power, vesting)
└── New endpoints:
    POST /treasury/balance (returns DAO PUSD balance)
    POST /treasury/transfer (agent autonomously executes PUSD transfer)
    GET /treasury/history (transaction log)
    GET /treasury/analytics (spending report)
```

### Integration Points
1. **Solana RPC**: Query PUSD token account, verify transactions
2. **Turnkey Wallet**: Policy engine enforces PUSD transfer limits
3. **Telegram Bot**: Users query treasury status, agent executes transfers
4. **Demo DAO**: Devnet DAO with multi-sig, funded with test PUSD

---

## 👥 Four-Agent Task Breakdown

### CLAUDE - Project Orchestration & Architecture
**Role**: Lead architect, final code review, integration point  
**Branch**: `feature/claude/palm-usd-integration`

**Tasks**:
- [ ] Coordinate all four agents
- [ ] Design treasury query endpoints (OpenAPI spec)
- [ ] Wire Turnkey wallet policy engine to PUSD transfers
- [ ] Create agent-brain PUSD service (orchestrate Gemini + Kimi work)
- [ ] Review all PRs before merge
- [ ] Test end-to-end integration
- [ ] Prepare live demo script

**Deliverables**:
- `packages/agent-provisioning/services/agent-brain/src/services/pusd-treasury.ts`
- `packages/agent-provisioning/services/agent-brain/src/handlers/treasury.ts`
- `INTEGRATION_GUIDE.md` (how to deploy with PUSD)

**Timeline**: 3 days (after other agents deliver)

---

### CODEX - Code Audit & Quality Assurance
**Role**: Independent auditor of Milestone 1 + new PUSD code  
**Branch**: `feature/codex/code-audit`

**Phase 1 - Existing Code Audit (Days 1-3, parallel with other agents)**

Audit scope:
- [ ] Review `packages/agent-provisioning/services/agent-brain/src/types/manifest.ts`
  - Check Zod schema completeness
  - Verify all fields have validation
  - Test edge cases (negative balances, overflow)
  - Check serialization safety

- [ ] Review `packages/agent-provisioning/services/agent-brain/src/services/mastra-agent.ts`
  - Verify agent initialization correctness
  - Check system prompt injection safety
  - Test skill registration mechanism
  - Validate spending limit enforcement logic

- [ ] Review `packages/agent-provisioning/services/agent-brain/src/handlers/message.ts`
  - Check input validation (no injection attacks)
  - Verify error handling
  - Test timeout handling
  - Validate response formatting

- [ ] Review `packages/agent-provisioning/services/agent-brain/src/index.ts`
  - Check HTTP endpoint security (CORS, rate limiting)
  - Verify middleware order
  - Test error responses
  - Check logging for PII exposure

- [ ] Review `packages/agent-provisioning/services/agent-brain/Dockerfile`
  - Check base image security (no vulnerable versions)
  - Verify multi-stage build efficiency
  - Test layer caching
  - Check file permissions

**Audit Output**: Create `CODEX-AUDIT-MILESTONE-1.md` with:
- Security issues found (Critical/High/Medium/Low)
- Performance bottlenecks
- Code quality recommendations
- Test coverage gaps
- Suggested refactors

**Phase 2 - PUSD Integration Code Review (Days 9-11)**

Review new code from Claude/Gemini/Kimi:
- [ ] `pusd-treasury.ts`: SPL token operations safety
- [ ] `treasury.ts`: API endpoint security
- [ ] PUSD transfer logic: Verify no double-spend, replay attacks
- [ ] Policy enforcement: Verify spending limits are hard limits
- [ ] Error handling: Verify no information leakage on failures

**Audit Output**: Create `CODEX-AUDIT-PALM-USD.md` with:
- Security clearance for mainnet deployment
- Performance metrics
- Scalability assessment
- Recommended fixes before submission

**Deliverables**:
- `CODEX-AUDIT-MILESTONE-1.md` (detailed security/quality report)
- `CODEX-AUDIT-PALM-USD.md` (PUSD integration review)
- PR comments with suggested fixes
- `CODE-QUALITY-CHECKLIST.md` (before submission)

**Timeline**: 
- Phase 1: Days 1-3 (parallel, independent)
- Phase 2: Days 9-11 (after other agents)

---

### GEMINI - PUSD Treasury Service & Agent Integration
**Role**: Implement treasury data access and agent-brain wire-up  
**Branch**: `feature/gemini/pusd-treasury-service`

**Tasks**:
- [ ] Create `packages/agent-provisioning/services/agent-brain/src/services/pusd-client.ts`
  - Query Solana RPC for PUSD token account balance
  - Fetch transaction history from chain
  - Parse SPL token metadata
  - Handle rate limiting to RPC endpoint

- [ ] Create `packages/agent-provisioning/services/agent-brain/src/types/pusd.ts`
  - Define PusdBalance interface (amount in lamports, formatted USD value)
  - Define TransactionRecord interface
  - Define TreasuryAnalytics interface
  - Zod schemas for validation

- [ ] Create `packages/agent-provisioning/services/agent-brain/src/handlers/treasury.ts`
  - GET /treasury/balance endpoint
  - GET /treasury/history endpoint (with pagination)
  - GET /treasury/analytics endpoint
  - Error handling for invalid DAO addresses

- [ ] Integrate into message handler
  - When user asks "What's our treasury balance?", call treasury service
  - Format response for Telegram display
  - Cache results for 5 minutes to avoid RPC spam

- [ ] Add treasury queries to agent-brain skills
  - Agent learns skills: check_treasury_balance, get_transaction_history, analyze_spending
  - Mastra agent can autonomously call these skills

**Deliverables**:
- `pusd-client.ts`: PUSD token data access layer
- `pusd.ts`: TypeScript types + Zod schemas
- `treasury.ts`: HTTP endpoints
- `PUSD-INTEGRATION.md`: How to use PUSD APIs

**Timeline**: 4 days (Days 3-6)

---

### KIMI - PUSD Transfer Execution & Deployment
**Role**: Implement autonomous PUSD transfers and VPS deployment  
**Branch**: `feature/kimi/pusd-transfers-deployment`

**Tasks**:
- [ ] Create `packages/agent-provisioning/services/agent-brain/src/services/pusd-transferor.ts`
  - Build PUSD SPL token transfer transaction
  - Integrate with Turnkey wallet policy engine
  - Sign transaction with agent wallet
  - Broadcast to Solana RPC
  - Return tx hash + explorer URL

- [ ] Create agent skill: execute_pusd_transfer
  - Input: amount in PUSD, recipient address, transfer reason
  - Output: tx hash, confirmation status
  - Verify spending policy before execution
  - Log all transfers for audit trail

- [ ] Create `packages/agent-provisioning/services/agent-brain/src/handlers/transfers.ts`
  - POST /treasury/transfer endpoint
  - Require approval if amount > threshold
  - Queue approval request to Telegram bot
  - Execute transfer after approval (or auto-execute if below threshold)

- [ ] Update Dockerfile
  - Add PUSD environment variables
  - Document required permissions

- [ ] Create VPS deployment script `deployment/deploy-pusd-agent.sh`
  - Pull latest code
  - Build Docker image
  - Update docker-compose.yml with PUSD env vars
  - Restart agent-brain service
  - Verify health check

- [ ] Create `.env.example` with PUSD vars
  - PUSD_TOKEN_MINT (6PEW2d4tdvjJyGEaJVjZLAqp9Wh9BLw8gLcTNv3S6PNP)
  - DAO_WALLET_ADDRESS
  - TURNKEY_POLICY_ID
  - SOLANA_RPC_URL
  - etc.

**Deliverables**:
- `pusd-transferor.ts`: PUSD transfer execution
- `transfers.ts`: Transfer API endpoints
- Updated Dockerfile with PUSD config
- `deploy-pusd-agent.sh`: One-command VPS deployment
- `VPS-SETUP-GUIDE.md`: How to deploy to 72.62.239.63

**Timeline**: 4 days (Days 3-6)

---

## 📅 14-Day Execution Timeline

### Phase 1: Parallel Development (Days 1-6)

**Day 1 - Kickoff**
- [ ] Claude: Create feature branches for all 4 agents
- [ ] Codex: Begin Phase 1 audit (Milestone 1 code review)
- [ ] Gemini: Start pusd-client.ts and types
- [ ] Kimi: Start pusd-transferor.ts and deployment script

**Days 2-3**
- [ ] Codex: Complete Milestone 1 audit, publish findings
- [ ] Gemini: Complete treasury service, test against devnet
- [ ] Kimi: Complete transfer executor, test signing

**Days 4-6**
- [ ] Gemini: Integrate treasury queries into agent skills
- [ ] Kimi: Create VPS deployment script, test on staging
- [ ] All agents: Push PRs to respective feature branches

### Phase 2: Integration & Testing (Days 7-9)

**Day 7 - Code Review**
- [ ] Claude: Review Gemini PR (treasury service)
- [ ] Claude: Review Kimi PR (transfer executor)
- [ ] Codex: Begin Phase 2 audit (PUSD integration)

**Days 8-9**
- [ ] Claude: Merge PRs into feature/claude/palm-usd-integration
- [ ] Claude: Wire treasury + transfers into agent-brain orchestration
- [ ] Claude: Test end-to-end message flow
- [ ] All: Integration testing in devnet

### Phase 3: Demo & Submission (Days 10-14)

**Days 10-11**
- [ ] Codex: Complete Phase 2 audit, publish findings
- [ ] Claude: Build demo DAO, fund with test PUSD
- [ ] Claude: Create Telegram demo script
- [ ] All: Final testing and bug fixes

**Days 12-13**
- [ ] Claude: Record 5-minute demo video (Loom)
- [ ] Claude: Create 12-slide pitch deck
- [ ] Claude: Write technical documentation
- [ ] Codex: Final code quality checklist

**Day 14 - Submission**
- [ ] Claude: Submit to Colosseum
- [ ] Claude: Push to GitHub (hello@palmusd.com gets access)
- [ ] Claude: Submit Loom video URL
- [ ] Claude: Submit pitch deck PDF

---

## 🎬 Demo Scenario

**User**: DAO treasurer  
**Platform**: Telegram  
**Scenario**: Check treasury balance and authorize a PUSD payment

```
User: "What's our treasury balance?"
Agent: "Your DAO treasury has 10,500 PUSD. Recent transactions: 
        - 500 PUSD to contractor (2 hours ago)
        - 1,000 PUSD to marketing (1 day ago)"

User: "Transfer 250 PUSD to alice.sol for development work"
Agent: "Request pending approval (amount within 30-day limit of $5,000).
       Click below to confirm:"
        [YES] [NO]

User: [clicks YES]
Agent: "✅ Transfer complete! 
       Tx: [solscan.io link]
       Recipient: alice.sol
       Amount: 250 PUSD"
```

---

## 📦 Submission Deliverables

**GitHub Repository** (hfsp-labs-colosseum-dev)
- [ ] Clean main branch with Milestone 1-2 merged
- [ ] feature/palm-usd-integration branch ready for review
- [ ] All code audited by Codex
- [ ] README updated with PUSD integration docs
- [ ] Access granted to hello@palmusd.com

**Loom Demo Video** (5 minutes max)
- [ ] Agent responds to "Check balance" query
- [ ] Agent executes "Transfer 250 PUSD" with approval
- [ ] Show transaction on Solscan
- [ ] Explain self-manifest system (how agent enforces limits)

**Pitch Deck** (12 slides, PDF)
1. Problem: DAOs need autonomous treasury mgmt
2. Solution: Self-aware AI agent with accountability
3. How it works: Self-manifest + Mastra + Turnkey
4. PUSD integration: Stable treasury reserves
5. Technical architecture (diagram)
6. Live demo (screenshot of Telegram)
7. Market: DAO treasury mgt is $XB TAM
8. Competitive advantage: Only autonomous + accountable solution
9. Traction: Works with test DAO, real PUSD transactions
10. Team: Shipped Milestone 1 in days
11. Roadmap: Multi-sig, yield strategies, governance
12. Call to action: "PUSD-native treasury is the standard"

**Documentation**
- [ ] INTEGRATION_GUIDE.md (how to use PUSD APIs)
- [ ] VPS-SETUP-GUIDE.md (production deployment)
- [ ] CODE-QUALITY-CHECKLIST.md (Codex audit findings)
- [ ] TECHNICAL-ARCHITECTURE.md (system design)

---

## 🔐 Code Audit Scope (Codex)

### Phase 1 - Existing Code (Milestone 1)

**Security Review**:
- [ ] No hardcoded secrets in code
- [ ] No SQL injection (uses Zod validation)
- [ ] No XSS in HTTP responses
- [ ] CORS properly configured
- [ ] No information leakage in error messages

**Correctness Review**:
- [ ] Spending policy logic is correct (no off-by-one errors)
- [ ] Manifest validation catches all invalid inputs
- [ ] Agent system prompt doesn't contradict actual capabilities
- [ ] Message handler correctly parses user input

**Performance Review**:
- [ ] No N+1 queries
- [ ] Agent response time < 2 seconds typical
- [ ] Memory usage stable (no leaks)
- [ ] Docker image size reasonable

**Code Quality Review**:
- [ ] TypeScript strict mode enabled
- [ ] No `any` types
- [ ] Consistent naming conventions
- [ ] Functions under 50 lines
- [ ] Tests cover happy path + error cases

### Phase 2 - PUSD Integration

**Security Review**:
- [ ] No double-spend vulnerabilities
- [ ] Policy enforcement is hard limit (not advisory)
- [ ] Transaction signing is secure (no key exposure)
- [ ] RPC calls use HTTPS only
- [ ] No replay attack vulnerability

**Correctness Review**:
- [ ] PUSD transfer logic handles decimals correctly (6 decimals for SPL)
- [ ] Balance queries return accurate values
- [ ] Transaction history is complete and ordered
- [ ] Policy limits are enforced before transaction broadcast

**Mainnet Readiness**:
- [ ] Code reviewed for mainnet deployment
- [ ] Error handling for network failures
- [ ] Rate limiting for Solana RPC
- [ ] Audit trail complete for all transfers

---

## 📊 Success Metrics

**Technical Metrics**:
- Code audit: 0 Critical, 0-2 High severity issues
- Test coverage: >80% for treasury service
- API latency: <500ms for balance queries, <2s for transfers
- Uptime: 99.9% during demo

**Product Metrics**:
- Demo works flawlessly (no crashes)
- Real PUSD transfers execute on devnet
- Telegram bot responds in <1 second
- Clear value proposition (judges understand problem)

**Execution Metrics**:
- All deliverables submitted on time
- Code meets Codex quality checklist
- Team coordinates without conflicts
- Zero merge conflicts between branches

---

## 🚀 Post-Hackathon (if we win)

**Mainnet Deployment**:
- [ ] Security audit by professional firm
- [ ] Deploy to Solana mainnet
- [ ] Launch with partner DAO
- [ ] Monitor for bugs in production

**Product Development**:
- [ ] Multi-sig support (require 2/3 approval for large transfers)
- [ ] Yield strategy automation (auto-stake PUSD in Marinade)
- [ ] Governance integration (auto-execute approved proposals)
- [ ] Mobile app for iOS/Android

---

## 📝 Branch Strategy

```
main (production)
├── feature/claude/palm-usd-integration (orchestration, final merge)
├── feature/codex/code-audit (audit reports, no code changes)
├── feature/gemini/pusd-treasury-service (treasury queries)
└── feature/kimi/pusd-transfers-deployment (transfer execution)
```

**Merge Order**:
1. Codex publishes audit (informational, not merged to main)
2. Gemini merges into Claude's branch
3. Kimi merges into Claude's branch
4. Claude merges feature/claude/palm-usd-integration → main

---

## 💾 File Structure (After Completion)

```
packages/agent-provisioning/services/agent-brain/
├── src/
│   ├── services/
│   │   ├── mastra-agent.ts (existing)
│   │   ├── pusd-client.ts (new - Gemini)
│   │   └── pusd-transferor.ts (new - Kimi)
│   ├── handlers/
│   │   ├── message.ts (existing)
│   │   ├── treasury.ts (new - Gemini)
│   │   └── transfers.ts (new - Kimi)
│   ├── types/
│   │   ├── manifest.ts (existing)
│   │   └── pusd.ts (new - Gemini)
│   └── index.ts (updated - Claude)
├── Dockerfile (updated - Kimi)
├── .env.example (new - Kimi)
└── PUSD-INTEGRATION.md (new - Gemini)

docs/
├── hackathons/
│   ├── PALM-USD-HACKATHON-STRATEGY.md (this file)
│   ├── CODEX-AUDIT-MILESTONE-1.md (Codex output)
│   ├── CODEX-AUDIT-PALM-USD.md (Codex output)
│   ├── CODE-QUALITY-CHECKLIST.md (Codex output)
│   └── SUBMISSION/
│       ├── PITCH-DECK.pdf
│       ├── TECHNICAL-ARCHITECTURE.md
│       ├── INTEGRATION-GUIDE.md
│       └── VPS-SETUP-GUIDE.md
```

---

## ✅ Pre-Submission Checklist

- [ ] All code merged to main
- [ ] Codex audit reports complete and findings addressed
- [ ] Demo video recorded and uploaded to Loom
- [ ] Pitch deck created (12 slides, PDF)
- [ ] GitHub repo clean, documented, private access to hello@palmusd.com
- [ ] README updated with PUSD integration section
- [ ] All environment variables documented in .env.example
- [ ] Deployment script tested on staging VPS
- [ ] End-to-end test passed (message → agent → PUSD transfer → Telegram response)
- [ ] No hardcoded secrets in repository
- [ ] License file present (MIT or Apache 2.0)

---

## 🤝 Team Communication

**Daily Standup**: Post updates in `.claude/context.md`

**Blocker Escalation**: If any agent is blocked, post in main group chat

**Code Review SLA**: 24 hours max for PR reviews

**Merge Authority**: Claude makes final merge decisions

---

**Document Created**: 2026-04-22  
**Next Review**: When Milestone 2 is complete and hackathon start date approaches  
**Owner**: Claude (Orchestration)
