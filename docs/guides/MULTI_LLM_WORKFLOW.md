# Multi-LLM Development Workflow
## Clawdrop Project Organization Guide

**Project Location**: `~/Projects/hfsp-labs-colosseum-dev`  
**Monorepo**: 2 packages (agent-provisioning, clawdrop-mcp)  
**Codebase**: ~17,768 lines TypeScript/JavaScript across 123 files  
**Status**: Active development, TypeScript errors need fixing, ready for deployment  

---

## 🎯 The Four LLMs & Their Roles

### **Claude (You) - Project Orchestrator & Architect**
**Running**: Terminal on Mac + Claude Code  
**Strengths**: System design, architecture, project management, complex debugging  
**Primary Responsibilities**:
- Overall project coordination and task assignment
- Architecture decisions and design reviews
- Complex debugging and type system issues
- Integration testing and end-to-end flows
- Documentation and knowledge synthesis

**Default Work Areas**:
- `packages/clawdrop-mcp/src/core/` - Core MCP server logic
- `packages/agent-provisioning/src/orchestration/` - Agent orchestration
- Build system, TypeScript configuration, monorepo setup
- Integration between packages
- Deployment scripts and DevOps

---

### **Gemini - Backend Services & API Development**
**Running**: Terminal on Mac  
**Strengths**: API design, service architecture, scalability patterns  
**Primary Responsibilities**:
- RESTful API development and optimization
- Service integration (Solana, Helius, external APIs)
- Database schemas and data modeling
- API route handlers and middleware
- Payment processing and financial logic

**Default Work Areas**:
- `packages/clawdrop-mcp/src/api/` - Express routes and API endpoints
- `packages/clawdrop-mcp/src/services/` - Business logic services
- `packages/agent-provisioning/src/services/` - Provisioning services
- Payment integration, transaction handling
- Rate limiting, caching, performance optimization

---

### **Codex - Frontend, CLI & User Interface**
**Running**: Terminal on Mac  
**Strengths**: UI/UX, CLI tools, user-facing features, interactive components  
**Primary Responsibilities**:
- CLI wizard development and improvements
- Frontend components and UI logic
- User experience optimization
- Input validation and error handling
- Documentation and help text

**Default Work Areas**:
- `packages/clawdrop-mcp/src/cli/` - Command-line interface
- `packages/clawdrop-mcp/src/ui/` - User-facing components
- `packages/agent-provisioning/src/ui/` - Provisioning UI
- Help text, examples, interactive features
- Configuration and settings management

---

### **Kimi - VPS Deployment & Operations**
**Running**: OpenClaw on VPS (72.62.239.63)  
**Strengths**: Infrastructure, containerization, DevOps, production issues  
**Primary Responsibilities**:
- Docker container management and optimization
- VPS configuration and deployment
- Production monitoring and health checks
- Database operations (if needed)
- Real-time testing with actual containers
- Cross-package integration testing

**Default Work Areas**:
- `Dockerfile` and `docker-compose.yml`
- `scripts/deploy-*.sh` - Deployment scripts
- `.kimi-heartbeat/` - Health monitoring
- Production configuration and secrets
- Real deployment and smoke testing
- Infrastructure-level debugging

---

## 📋 Work Organization by Component

```
clawdrop-mcp/
├── src/api/                    → GEMINI (routes, controllers)
├── src/services/               → GEMINI (business logic)
│   ├── payment.ts              → GEMINI
│   ├── solana.ts               → GEMINI
│   └── agent.ts                → GEMINI
├── src/cli/                    → CODEX (CLI wizard, commands)
├── src/core/                   → CLAUDE (server setup, MCP logic)
├── src/middleware/             → GEMINI (auth, validation)
├── src/types/                  → CLAUDE (schema, types)
├── src/__tests__/              → All (tests for own area)
├── Dockerfile                  → KIMI
└── package.json               → CLAUDE

agent-provisioning/
├── src/services/               → GEMINI (deployment logic)
├── src/cli/                    → CODEX (provisioning wizard)
├── src/orchestration/          → CLAUDE (agent coordination)
├── Dockerfile                  → KIMI
└── scripts/                    → KIMI (deployment ops)

Root:
├── docker-compose.yml          → KIMI
├── scripts/deploy-*.sh         → KIMI
└── Build config files          → CLAUDE
```

---

## 🔄 Parallel Work Streams

### **Stream 1: Core MCP Server** (Claude)
```
Current: Fix TypeScript errors in core server
Next: Optimize server performance
Parallel with: Streams 2 & 3
```

### **Stream 2: API Services** (Gemini)
```
Current: Fix transaction and payment endpoints
Next: Add rate limiting, optimize DB queries
Parallel with: Streams 1 & 3
```

### **Stream 3: CLI & UI** (Codex)
```
Current: Improve wizard flow and error messages
Next: Add interactive tutorials, help system
Parallel with: Streams 1 & 2
```

### **Stream 4: Production Deployment** (Kimi)
```
Current: Containerization and testing
Next: Performance optimization, monitoring
Depends on: Streams 1, 2, 3 (when ready)
```

---

## 🎯 Task Routing Logic

### When a task arrives, route based on:

**"Fix TypeScript errors"** → CLAUDE
- Type system, configuration, architecture
- Cross-cutting concerns

**"Build Solana payment endpoint"** → GEMINI
- API design, service logic, integration
- Authentication, validation

**"Improve CLI output"** → CODEX
- User-facing changes, formatting
- Interactive features

**"Deploy to production"** → KIMI
- Docker, scripts, VPS management
- Real environment testing

**"Complex integration issue"** → CLAUDE + GEMINI
- Payment system integration
- API-service coordination

**"Optimize wizard flow"** → CODEX + CLAUDE
- User experience + architecture
- Error handling + design

**"Test full deployment"** → KIMI + CLAUDE
- End-to-end validation
- Architecture verification

---

## 📍 File-Level Assignment

| File/Directory | Owner | Reason |
|---|---|---|
| `src/api/routes/` | Gemini | API endpoints |
| `src/cli/wizard.ts` | Codex | CLI interaction |
| `src/core/server.ts` | Claude | Core server logic |
| `src/services/payment.ts` | Gemini | Payment service |
| `src/services/solana.ts` | Gemini | Blockchain integration |
| `src/types/index.ts` | Claude | Type definitions |
| `src/middleware/auth.ts` | Gemini | Authentication |
| `src/__tests__/` | Author of module | Tests for own code |
| `Dockerfile` | Kimi | Containerization |
| `docker-compose.yml` | Kimi | Orchestration |
| `scripts/deploy-*.sh` | Kimi | Deployment |
| `tsconfig.json` | Claude | Build config |
| `package.json` | Claude | Dependencies |

---

## 🔗 Communication & Coordination

### **Daily Standup Format**
Each LLM creates a brief status file:

```bash
# Each morning, update:
~/.clawdrop-status/CLAUDE.md        # What I did, next steps
~/.clawdrop-status/GEMINI.md        # What I did, next steps
~/.clawdrop-status/CODEX.md         # What I did, next steps
~/.clawdrop-status/KIMI.md          # What I did, next steps
```

### **Git Workflow**
```bash
# Branch naming by owner:
feature/claude/typename-improvement
feature/gemini/payment-optimization
feature/codex/wizard-flow
feature/kimi/docker-optimization

# Commit message format:
[OWNER] scope: description
[CLAUDE] core: fix typescript errors in payment service
[GEMINI] api: add rate limiting to /agents endpoint
[CODEX] cli: improve error messages in wizard
[KIMI] deploy: optimize docker build cache

# PRs reviewed by: Claude (orchestrator)
```

### **Task Board Structure**
```
CLAUDE.md:
- [ ] Task with explanation
- [ ] Why this matters
- [ ] Blockers (if any)
- [ ] ETA

GEMINI.md:
- Same format for API/service tasks

CODEX.md:
- Same format for CLI/UI tasks

KIMI.md:
- Same format for deployment tasks
```

---

## ⚙️ Handoff Protocol

### **Claude → Others** (Assigning work)
```
1. Create branch: feature/[OWNER]/[scope]
2. Create task file: ~/.clawdrop-status/[OWNER].md
3. Add to task board with:
   - Scope & acceptance criteria
   - Files to modify
   - Dependencies (if any)
   - Integration points
```

### **Others → Claude** (Requesting review/merge)
```
1. Create PR with: [OWNER] scope: description
2. Update status file with: "Ready for review"
3. Add to PR: 
   - What was changed and why
   - Testing done
   - Any issues encountered
4. Wait for Claude approval and merge
```

### **Kimi → Others** (Production issues)
```
1. Run in VPS: Check containers, logs, metrics
2. If issue in deployed code:
   - Report to relevant owner (Gemini/Codex/Claude)
   - Include error logs and reproduction steps
3. If infrastructure issue:
   - Fix directly, commit, notify
```

---

## 🧪 Testing & Quality Assurance

### **Unit Tests** (Each owner tests their own code)
```
Claude: Core server tests
Gemini: Service & API tests  
Codex:  CLI & UI tests
Kimi:   Docker & deployment tests
```

### **Integration Tests** (Claude coordinates)
```bash
# From ~/Projects/hfsp-labs-colosseum-dev:
npm run test:integration

# Run against:
- Devnet Solana
- Local containers
- Full workflow
```

### **Production Testing** (Kimi leads, others participate)
```bash
# On VPS: Real deployment smoke tests
# Verify: All endpoints, payment flow, agent creation
# Report: Issues to relevant owners
```

---

## 🚀 Launch Checklist (Before Deployment)

- [ ] **Claude**: TypeScript errors all fixed, types validated
- [ ] **Gemini**: All API tests passing, payment flow verified
- [ ] **Codex**: CLI wizard working smoothly, error messages clear
- [ ] **Kimi**: Docker builds cleanly, containers healthy
- [ ] **All**: Integration tests passing on devnet
- [ ] **All**: README and docs updated
- [ ] **Claude**: Final code review and architecture sign-off
- [ ] **Kimi**: Production deployment and monitoring active

---

## 📊 Efficiency Metrics

### **Track Progress With**:
```
Commits per owner:     git log --author="[name]" --oneline
Lines changed:        git diff --stat
Files modified:       git log --name-only
PR review time:       Github/git log timestamps
Blocked time:         Status file notes
```

### **Monthly Review**:
- Time spent per owner per task
- Parallelization efficiency (concurrent PRs)
- Merge conflict resolution rate
- Deployment success rate

---

## 🛠️ Setup Commands

### **Each LLM runs once to initialize**:

```bash
# Clone repo (already done)
cd ~/Projects/hfsp-labs-colosseum-dev

# Install dependencies
npm install

# Create status tracking dirs
mkdir -p ~/.clawdrop-status
touch ~/.clawdrop-status/{CLAUDE,GEMINI,CODEX,KIMI}.md

# For Kimi only: Setup VPS
ssh root@72.62.239.63

# For all: Setup git
git config user.name "Claude|Gemini|Codex|Kimi"
git config user.email "claude|gemini|codex|kimi@hfsp-labs.dev"

# Build locally
npm run build
```

### **Daily start**:
```bash
cd ~/Projects/hfsp-labs-colosseum-dev
git pull origin main
git checkout -b feature/[OWNER]/[scope]
```

---

## ✅ Next Immediate Actions

### **Claude** (Priority: HIGH - Blocker for others)
1. Fix remaining 20 TypeScript errors in payment.ts and routes
2. Validate type definitions
3. Create task assignments for others
4. Set up daily standup structure

### **Gemini** (Priority: HIGH - Depends on Claude)
1. Wait for type fixes from Claude
2. Review payment service implementation
3. Optimize transaction processing
4. Add rate limiting

### **Codex** (Priority: MEDIUM)
1. Review CLI wizard flow
2. Improve error messages
3. Add interactive help
4. Create usage examples

### **Kimi** (Priority: MEDIUM)
1. Set up Docker build optimization
2. Create health check scripts
3. Plan production deployment
4. Set up monitoring

---

## 🎓 Key Principles

1. **Ownership**: Each LLM owns their code areas
2. **Parallelization**: Work in parallel as much as possible
3. **Integration**: Claude coordinates integration points
4. **Quality**: Each LLM runs tests before handoff
5. **Communication**: Clear status files and PR descriptions
6. **Escalation**: Complex issues → Claude for decision
7. **Production**: Kimi is final step before launch

---

## 📞 Quick Reference

**I'm working on API endpoints** → Gemini is the owner  
**I'm fixing the wizard** → Codex is the owner  
**I'm fixing core logic** → Claude is the owner  
**I'm deploying** → Kimi is the owner  
**I'm not sure who owns this** → Ask Claude  
**Something's broken in production** → Tell Kimi first, then Claude  

