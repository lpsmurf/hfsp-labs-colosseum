# Colosseum Development Guide

## Phase 2: Skills Architecture (Context Engineering Optimization)

The Colosseum project includes 4 specialized skills designed to reduce token consumption and improve coordination when multiple LLM agents work together.

### Available Skills

All skills are located in `.internal/.claude/skills/` directory:

#### 1. **colosseum-sdk** — Service Patterns & API Contracts
SDK patterns, client libraries, type definitions, payment protocol, MemPalace integration

#### 2. **colosseum-cli** — CLI Commands & Deployment
CLI commands reference, service management, Docker operations, deployment procedures

#### 3. **colosseum-debug** — Error Diagnostics & Troubleshooting
Error codes, failure patterns, troubleshooting procedures, log interpretation

#### 4. **colosseum-agents** — Multi-Agent Coordination
File ownership matrix, task specificity, dependency graphs, conflict resolution

See `.internal/.internal/.claude/skills/manifest.json` for complete details.



---

## Phase 3: Session-Closer Metadata API

Session-closer now exposes agent work metrics as HTTP API endpoints, enabling agents to query coordination data without reading git history or context files.

### Service: Metadata API (Port 3335)

**Start the service**:
```bash
npm run metadata-service

# Or with custom port:
METADATA_PORT=3336 npm run metadata-service
```

### Endpoints

#### GET /health
Service health check.

```bash
curl http://localhost:3335/health | jq .
```

Response: `{ status: "healthy", uptime: 123.456 }`

---

#### GET /api/v1/session-status
Complete session metadata with all agents and metrics.

**Query Parameters**:
- `hours_back=8` (default) — Look back N hours
- `agent=Claude` — Filter to single agent

```bash
# Get all agents
curl 'http://localhost:3335/api/v1/session-status' | jq .agents

# Get single agent
curl 'http://localhost:3335/api/v1/session-status?agent=Claude' | jq .

# Look back 24 hours
curl 'http://localhost:3335/api/v1/session-status?hours_back=24' | jq .
```

**Response includes**:
- Per-agent metrics: commits, files changed, lines, tasks, blockers, branch, status
- Team metrics: totals, average commits per agent
- Blockers: what's blocking progress
- Dependencies: cross-agent blockers
- Velocity: commits/files/lines per hour
- Critical path: longest dependency chain

---

#### GET /api/v1/session-status/blockers
Only blockers and what's blocking progress.

```bash
curl 'http://localhost:3335/api/v1/session-status/blockers' | jq .blockers
```

Response shows which agents are blocked and why.

---

#### GET /api/v1/session-status/dependencies
Agent dependency graph.

```bash
# See all dependencies
curl 'http://localhost:3335/api/v1/session-status/dependencies' | jq .

# Check critical path
curl 'http://localhost:3335/api/v1/session-status/dependencies' | jq .critical_path
```

Shows what agents are waiting for, relationship type, and status.

---

#### GET /api/v1/session-status/velocity
Team velocity metrics (commits/files/lines per hour).

```bash
curl 'http://localhost:3335/api/v1/session-status/velocity' | jq .
```

Response includes per-agent efficiency ratios and trend (accelerating/stable/decelerating).

---

#### GET /api/v1/session-status/conflicts
File ownership conflicts (auto-detected).

```bash
curl 'http://localhost:3335/api/v1/session-status/conflicts' | jq .conflicts
```

Shows files modified by multiple agents (potential merge conflict risk).

---

### Use Cases

**Agent checks what others completed**:
```bash
# Claude asks: What did Codex do?
curl 'http://localhost:3335/api/v1/session-status?agent=Codex' | jq .agents.Codex
```

**Agent checks if it's blocked**:
```bash
curl 'http://localhost:3335/api/v1/session-status/dependencies' | jq '.dependencies[] | select(.to_agent == "Claude")'
```

**Team checks current blockers**:
```bash
curl 'http://localhost:3335/api/v1/session-status/blockers' | jq '.critical_blockers'
```

**Dashboard pulls team velocity**:
```bash
curl 'http://localhost:3335/api/v1/session-status/velocity' | jq .team_velocity
```

**Detect file conflict risks**:
```bash
curl 'http://localhost:3335/api/v1/session-status/conflicts' | jq '.merge_conflict_risk'
```

---

### Architecture

**Three new files**:
- `scripts/session-closer/models.ts` — Zod schemas for request/response validation
- `scripts/session-closer/extractors.ts` — Helper functions for metrics extraction
- `scripts/session-closer/metadata-service.ts` — Express HTTP server

**Data Source**: Git history (parsed from commit prefixes `[CLAUDE]`, `[OPENAI]`, `[GEMINI]`, `[KIMI]`)

**Integration**: Works with `colosseum-agents` skill to show policy vs. reality gap.

---

### Expected Token Impact (Phase 3 Cumulative)

| Phase | Tokens | Savings |
|-------|--------|---------|
| Baseline | 12-16M | — |
| Phase 1 (metadata endpoints) | 10-12M | 20-30% |
| Phase 2 (skills) | 8-10M | 35-50% |
| **Phase 3 (this)** | **6-8M** | **50-75%** |

Agents query APIs instead of discovering state through repeated exploration.

