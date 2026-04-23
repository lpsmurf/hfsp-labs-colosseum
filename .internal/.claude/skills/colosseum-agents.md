# Colosseum Multi-Agent Coordination

**Metadata**: Multi-agent coordination, session management, collaboration patterns  
**Activation Triggers**: "coordination", "dependencies", "blocking", "waiting for", "session", "summary", "handoff", "next steps", "file ownership", "conflict", "who's working", "branch", "merge", "integration", "phase", "milestone", "progress"  
**Token Cost**: ~85 tokens (metadata only), ~250 tokens (full content)

---

## 1. File Ownership Matrix Template

The File Ownership Matrix prevents conflicts when 4 agents (Claude, Codex, Gemini, Kimi) modify the same codebase.

**Template for Each Milestone**:

```
FILE: src/index.ts
  Owner: Claude
  Status: CRITICAL (core application entry point)
  Dependencies: src/types.ts (Codex), src/handlers/* (Gemini)
  Modification Rules: 
    - Only Claude modifies
    - Codex/Gemini submit type changes via PR
    - Breaking changes require all-agent sign-off
  Read-Only Access: Gemini, Kimi (reference only)
  Last Modified: Claude on 2026-04-23
```

```
FILE: src/types.ts
  Owner: Codex
  Status: CRITICAL (types used by all agents)
  Dependencies: (none, foundational)
  Modification Rules:
    - Codex maintains all type definitions
    - Other agents request type changes via issues
    - New types must be backward compatible
  Read-Only Access: Claude, Gemini, Kimi (all use these types)
  Last Modified: Codex on 2026-04-22
```

```
FILE: src/handlers/message.ts
  Owner: Gemini
  Status: OPTIONAL (specific domain, less critical)
  Dependencies: src/types.ts (Codex), src/index.ts (Claude)
  Modification Rules:
    - Gemini owns all message handling logic
    - Must maintain contracts from src/types.ts
    - Cannot modify express server setup (Claude's)
  Read-Only Access: Claude, Kimi (integration only)
  Last Modified: Gemini on 2026-04-23
```

```
FILE: .env.example
  Owner: SHARED (all agents)
  Status: CRITICAL (configuration reference)
  Modification Rules:
    - Any agent can add new env vars they introduce
    - Must document what each var does
    - Notify other agents when adding required vars
    - Format: VAR_NAME=description
  Last Modified: All agents
```

---

## 2. Task Specificity Checklist

When assigning work to an agent, be SPECIFIC. Vague assignments cause conflicts and duplicated work.

**Bad Task Assignment** ❌
> "Claude: Handle infrastructure. Codex: Handle API integration. Gemini: Handle error handling."

**Problem**: Overlapping domains. Is error handling infrastructure or API? Where's the boundary?

**Good Task Assignment** ✅
```
Claude:
  Modifies: docker-compose.yml, Dockerfile, .github/workflows/*, scripts/deployment/*
  Reads: package.json, src/index.ts (reference only), docs/CONTEXT-ENGINEERING-AUDIT.md
  Cannot touch: src/handlers/* (Gemini), src/services/* (Codex), src/types.ts (Codex)
  Deliverable: Phase 1 Docker testing complete by 2026-04-25
  Blockers: None currently
  Next steps: After testing, Phase 2 metadata endpoints

Codex:
  Modifies: src/types.ts, src/services/*, package.json (dependency versions only)
  Reads: src/handlers/* (Gemini, reference), src/index.ts (Claude, reference)
  Cannot touch: docker setup (Claude), handler logic (Gemini), session-closer (Kimi)
  Deliverable: Type definitions + service layer ready by 2026-04-25
  Blockers: Waiting for Claude to finalize service contracts
  Next steps: Test with Gemini's handlers

Gemini:
  Modifies: src/handlers/*, tests/*, docs/guides/*
  Reads: src/types.ts (Codex), src/services/* (Codex), src/index.ts (Claude)
  Cannot touch: Infrastructure (Claude), type definitions (Codex), session management (Kimi)
  Deliverable: Message handlers + webhook processor by 2026-04-25
  Blockers: Waiting for types from Codex
  Next steps: Integrate with Codex's services

Kimi:
  Modifies: scripts/session-closer/*, .claude/context.md, SESSIONS/*
  Reads: git logs (all agents), src/* (reference only for metrics)
  Cannot touch: Application code, deployment, service logic
  Deliverable: Multi-agent session tracking by 2026-04-25
  Blockers: None (can work in parallel)
  Next steps: Expose session metadata as API endpoint
```

**Clarity Rules**:
1. List EXACT files (not categories like "infrastructure")
2. Mark each as MODIFIES, READS, or CANNOT TOUCH
3. Define one clear owner per file
4. Show concrete blockers ("waiting for Codex's types")
5. Specify deliverable and deadline

---

## 3. Dependency Graphs & Phase-Based Work

Structure work in phases to minimize blocking dependencies.

### Phase 1: Independent Utilities (Parallel Work)

All agents can work on these independently:

```
Claude:
  - Docker/deployment setup
  - Service configuration
  - Logging infrastructure

Codex:
  - Type definitions (src/types.ts)
  - Shared utilities (src/utils/*)
  - Service interfaces (but not implementations)

Gemini:
  - Handler interfaces (signatures, no implementations yet)
  - Test setup
  - Documentation structure

Kimi:
  - Session-closer scripts
  - .claude/context.md template
  - SESSIONS/ folder setup
```

**Dependencies**: None between phases (all parallel)  
**Duration**: 1 day

### Phase 2: Depends on Phase 1 (Mostly Parallel)

```
Claude:
  - Health endpoints
  - Express server setup
  
  ↑ Depends on: Codex's types (BLOCKING)
  ↓ Provides: Express skeleton

Codex:
  - Service implementations
  - Payment protocol logic
  
  ↑ Depends on: Claude's server setup (non-blocking)
  ↓ Provides: Services for handlers

Gemini:
  - Message handlers (can start with mock services)
  - Webhook processing
  
  ↑ Depends on: Codex's types (BLOCKING)
  ↓ Provides: Request handlers

Kimi:
  - Session metrics extraction
  
  ↑ Depends on: All agents committing code with tags
  ↓ Provides: Session summaries
```

**Critical Path**: Codex → (Claude + Gemini) → Kimi  
**Duration**: 2 days  
**Parallelizable**: Claude and Gemini can start in parallel on day 1, but Codex might block them

### Phase 3: Integration (Sequential)

```
Claude:
  - Docker compose orchestration
  - Service health monitoring
  
  ↑ Depends on: Codex + Gemini Phase 2 (BLOCKING)

Codex:
  - Payment integration testing
  - Error handling refinement
  
  ↑ Depends on: Claude's Docker setup (BLOCKING)

Gemini:
  - End-to-end message flow testing
  - Error diagnostics
  
  ↑ Depends on: Claude + Codex (BLOCKING)

Kimi:
  - Final session summary
  - Multi-agent metrics
  
  ↑ Depends on: All agents completing Phase 2 (BLOCKING)
```

**Critical Path**: Codex → Claude → (Gemini + Kimi) → Final  
**Duration**: 1-2 days

---

## 4. Integration Boundary Contracts

When Agent A's code is used by Agent B, define a contract at the boundary.

### Example 1: Logger (Codex → All Agents)

**Contract** (Codex provides, All consume):
```typescript
// Codex owns: src/utils/logger.ts
export interface Logger {
  debug(data: Record<string, any>, msg: string): void;
  info(data: Record<string, any>, msg: string): void;
  warn(data: Record<string, any>, msg: string): void;
  error(data: Record<string, any>, msg: string): void;
}

export function createLogger(): Logger;
```

**Usage by Claude, Gemini, Kimi**:
```typescript
// Claude in src/index.ts
import { createLogger } from "./utils/logger.js";
const logger = createLogger();
logger.info({ port }, "Service started");

// Gemini in src/handlers/message.ts
import { createLogger } from "../utils/logger.js";
const logger = createLogger();
logger.info({ userId }, "Message received");
```

**Contract Guarantees**:
- Logger methods are stable (won't change signature)
- Structured logging format is consistent (JSON output)
- All agents can rely on this interface

---

### Example 2: Types (Codex → All Agents)

**Contract** (Codex provides types, others implement):
```typescript
// Codex owns: src/types.ts
export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot: boolean; first_name?: string };
  text?: string;
}

export interface AgentRequest {
  user_id: string;
  chat_id: string;
  text: string;
  message_id: number;
}

export interface AgentResponse {
  status: "ok" | "error";
  response: string;
  timestamp: string;
}
```

**Claude's Obligation** (src/index.ts):
- Receive AgentRequest
- Return AgentResponse (matching interface exactly)
- Don't change these types without Codex approval

**Gemini's Obligation** (src/handlers/message.ts):
- Accept AgentRequest
- Call Codex's services with right types
- Don't depend on implementation details

---

### Example 3: Session-Closer (Kimi → All Agents)

**Contract** (Kimi provides metadata endpoint):
```typescript
// Kimi exposes: GET /api/v1/session-status
{
  "agents": {
    "Claude": {
      "commits": 3,
      "files_changed": ["docker-compose.yml", "src/index.ts"],
      "lines_added": 245,
      "lines_removed": 128,
      "tasks_completed": ["Phase 1 Docker testing"],
      "blockers": [],
      "status": "in_progress"
    },
    "Codex": { ... },
    "Gemini": { ... },
    "Kimi": { ... }
  },
  "dependencies": [
    { "blocked": "Gemini", "waiting_for": "Codex", "reason": "types not yet complete" }
  ]
}
```

**All Agents' Obligation**:
- Commit messages follow `[AGENT] feature: description` format
- Update `.claude/context.md` daily
- Check session metadata for blockers

---

## 5. Multi-Agent Session Structure

Daily `.claude/context.md` template for coordinating 4 agents:

```markdown
# Session Context: 2026-04-23

## Claude Status
- **Working On**: Phase 2 metadata endpoints implementation
- **Status**: In Progress
- **Blockers**: None
- **Next Priority**: Complete metadata endpoint by EOD, then review Codex's work
- **Branch**: feature/claude/metadata-endpoints
- **Last Commit**: abc123def (2026-04-23 10:00 UTC)

## Codex Status
- **Working On**: Service layer refactoring + type definitions
- **Status**: In Progress
- **Blockers**: None currently
- **Next Priority**: Complete types for Claude's endpoints, test with Gemini's handlers
- **Branch**: feature/codex/service-refactor
- **Last Commit**: def456ghi (2026-04-23 09:30 UTC)

## Gemini Status
- **Working On**: Webhook handler + message processing
- **Status**: Blocked (waiting for type definitions from Codex)
- **Blockers**: Codex's types not yet finalized
- **Next Priority**: Start implementing once types available
- **Branch**: feature/gemini/webhook-handler
- **Last Commit**: Not yet (waiting for types)

## Kimi Status
- **Working On**: Session-closer multi-agent tracking
- **Status**: In Progress
- **Blockers**: None (independent work)
- **Next Priority**: Extract metrics from all agents' commits, expose as API
- **Branch**: feature/kimi/session-metadata
- **Last Commit**: ghi789jkl (2026-04-23 08:00 UTC)

## Cross-Agent Dependencies
- Codex → Claude: Types for response contracts
- Codex → Gemini: Type definitions (BLOCKING Gemini)
- Claude → Gemini: Express server pattern reference
- Kimi → All: Session metadata queries (ready now)

## Integration Points
- Claude's /health endpoint (used by all for monitoring)
- Codex's types (consumed by Claude + Gemini)
- Kimi's session metrics (consumed by all for status)

## Next Sync
April 23, 2026 - End of day standup (async in commit messages)
```

---

## 6. Session-Closer as Metadata Service (Phase 3 Vision)

Currently, session-closer generates .md files. In Phase 3, it should expose metrics as an API:

```bash
# Query session status
curl http://localhost:3334/api/v1/session-status | jq .

# Response shows real-time metrics from git history
{
  "session_id": "2026-04-23-multi-agent",
  "agents": {
    "Claude": {
      "commits": 5,
      "files_changed": 12,
      "lines_added": 450,
      "lines_removed": 200,
      "tasks": ["Phase 1 Docker testing", "Phase 2 metadata endpoints"],
      "blockers": [],
      "status": "in_progress"
    },
    ...
  },
  "team_metrics": {
    "total_commits": 18,
    "total_files_changed": 35,
    "blockers": ["Gemini waiting for Codex types"],
    "velocity": 1.2  // commits per agent per hour
  },
  "critical_path": "Codex → Claude → Gemini",
  "est_completion": "2026-04-25T18:00:00Z"
}
```

**Use Cases**:
- Agent A checks "what did Agent B complete?" without reading git
- Dashboard shows team progress in real-time
- Blockers are visible to all agents immediately
- Integration planning is data-driven

---

## 7. Conflict Resolution Patterns

When two agents modify the same file, follow this process:

### Prevention (Primary)
1. Use File Ownership Matrix (Section 1)
2. Mark files as MODIFIES, READS, or CANNOT TOUCH
3. Update matrix before each phase

### Detection
```bash
# Check for merge conflicts
git status  # Shows "both modified" files

# View conflict details
git diff --name-only --diff-filter=U

# Show conflicting lines
git diff HEAD -- <file>
```

### Resolution
1. **Communicate**: Use `.claude/context.md` to discuss the conflict asynchronously
2. **Understand Intent**: Review both agents' commits to understand what each was trying to achieve
3. **Merge Carefully**:
   ```bash
   # Option 1: Take all of one agent's changes
   git checkout --ours <file>   # Keep Claude's version
   git checkout --theirs <file> # Keep Codex's version
   
   # Option 2: Manual merge (edit the file, remove conflict markers)
   # Then: git add <file> && git commit
   ```
4. **Notify Other Agent**: Ping them in next session context with what was merged and why

### Learning
After resolving, update the File Ownership Matrix:
```
- Claude owns docker setup (CRITICAL)
- Codex owns services (CRITICAL)
- Both previously modified src/index.ts → NOW ONLY CLAUDE (add to matrix)
```

---

## 8. Git Branching Strategy

All agents use consistent branching for easy coordination:

**Branch Naming**:
```
feature/[agent]/[feature-name]

Examples:
- feature/claude/docker-testing
- feature/codex/service-refactor
- feature/gemini/webhook-handler
- feature/kimi/session-metadata
```

**Main Branch Rules**:
- `main` is production-ready (all tests pass, all agents sign off)
- Only merge complete features (no partial work)
- All commits to `main` have `[AGENT]` prefix for tracking

**Merge Process**:
1. Open PR with description of work done
2. Request review from other agents (especially those listed in dependencies)
3. Wait for approval (or agreement in `.claude/context.md`)
4. Merge with `[AGENT] feat: description` commit message
5. Update `.claude/context.md` with completion status

---

## Coordination Checklist

Before each work session, verify:

```
Preparation:
  ☐ Read latest .claude/context.md (what are others doing?)
  ☐ Check dependencies section (are you blocked by anyone?)
  ☐ Check File Ownership Matrix (what files are yours to modify?)
  ☐ Run session-closer to see team progress

During Work:
  ☐ Commit frequently with [AGENT] prefix
  ☐ Update .claude/context.md if status changes
  ☐ Flag blockers immediately (don't wait until end of day)
  ☐ Check session metadata if questioning what others did

End of Session:
  ☐ Run session-closer (auto-generates summary + commits)
  ☐ Update .claude/context.md with next priority
  ☐ Note any blockers or dependencies for next agents
  ☐ Leave code in "ready for next agent" state
```

---

## Source References

- Parallel orchestration lessons: `.claude/PARALLEL_ORCHESTRATION_LESSONS.md`
- Session context template: `.claude/context.md`
- Session summaries: `SESSIONS/` folder
- Multi-agent audit: `docs/CONTEXT-ENGINEERING-AUDIT.md`

