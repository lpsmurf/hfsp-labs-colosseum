# Repository Cleanup & Archival Plan

## Current Mess
- 16 planning docs in `packages/agent-provisioning/` (3DAY_*, PLAN_*, etc)
- Scattered README files
- No clear separation between active code and planning artifacts

## Cleanup Strategy

### Phase 1: Create Archive Structure (Do this today)
```
/
├── .github/              (GitHub workflows, templates)
├── SESSIONS/             (Daily session summaries — NEW)
├── docs/                 (Planning, architecture, guides — NEW)
│   ├── architecture/
│   ├── planning/         (Move 3DAY_*.md, PLAN_*.md here)
│   └── api/
├── packages/
│   ├── clawdrop-mcp/
│   └── agent-provisioning/  (Clean: remove .md planning files)
└── scripts/              (Utilities — NEW)
    └── session-closer.sh
```

### Phase 2: Move Files

**Archive these to `docs/planning/`:**
- `packages/agent-provisioning/3DAY_*.md` (4 files)
- `packages/agent-provisioning/*PLAN*.md` (3 files)
- `packages/agent-provisioning/ACTION_*.md` (1 file)
- `packages/agent-provisioning/FINAL_*.md` (1 file)
- `packages/agent-provisioning/CRITICAL_*.md` (1 file)
- `packages/agent-provisioning/REALITY_*.md` (1 file)
- `packages/agent-provisioning/START_*.md` (2 files)
- `packages/agent-provisioning/IMPLEMENTATION_*.md` (1 file)

**Keep in root:**
- `README.md` (project overview)
- `CLAUDE.md` (existing)
- `AGENT_UX_ARCHITECTURE.md` (current architecture — move to docs/architecture/)

**Root structure after cleanup:**
```
README.md                        ← Project overview
CLAUDE.md                        ← Claude context (existing)
docs/
├── AGENT_UX_ARCHITECTURE.md    ← Moved from root
├── architecture/
│   └── [API, deployment, agent architecture docs]
├── planning/
│   ├── 3DAY_SPRINT.md          ← Archived planning
│   ├── 3DAY_CRYPTO_PAYMENT.md
│   ├── FINAL_3DAY_PLAN.md
│   └── ... (all old planning)
└── guides/
    └── [Setup, deployment, dev guides]
SESSIONS/
├── SESSION-SUMMARY-TEMPLATE.md
├── 2026-04-22-dev-session.md   ← Today's summary
├── 2026-04-23-dev-session.md   ← Tomorrow's summary
└── ...
scripts/
├── session-closer.sh
└── cleanup-repo.sh             ← Run once to organize
```

### Phase 3: Git Operations

**Preserve history, reorganize:**
```bash
# Move files (preserves git history)
mkdir -p docs/{planning,architecture,guides}
git mv packages/agent-provisioning/3DAY_*.md docs/planning/
git mv packages/agent-provisioning/*PLAN*.md docs/planning/
git mv AGENT_UX_ARCHITECTURE.md docs/architecture/

# Commit cleanup
git commit -m "chore: organize planning docs to docs/planning

- Move 16 planning artifacts to docs/planning/
- Keep repo root clean (README, CLAUDE.md, architecture docs)
- Establish SESSIONS/ for daily summaries
- Create scripts/ for utilities

Structure:
  docs/planning/ — historical sprint/plan docs
  docs/architecture/ — architecture decisions
  SESSIONS/ — daily session summaries
  scripts/ — dev utilities"
```

### Phase 4: Update References

**Update CLAUDE.md:**
```markdown
## Key Directories

| Path | Purpose |
|------|---------|
| `docs/architecture/` | Architecture decisions & diagrams |
| `docs/planning/` | Historical sprint plans (reference) |
| `SESSIONS/` | Daily session summaries |
| `packages/clawdrop-mcp/` | MCP server |
| `packages/agent-provisioning/services/agent-brain/` | Mastra agent |
```

**Create `.github/CONTRIBUTING.md`:**
- Point to `CLAUDE.md` for Claude Code context
- Point to `docs/` for architecture
- Point to `SESSIONS/` for session tracking

---

## Implementation Order

1. **Today (after current session)**: Create `docs/`, move files, commit
2. **Tomorrow**: All new planning goes to `docs/planning/` not root
3. **Each session end**: Run `./scripts/session-closer.sh` to auto-generate `SESSIONS/[date].md`

---

## One-Time Cleanup Command

```bash
#!/bin/bash
# Run this ONCE to organize repo

cd ~/Projects/hfsp-labs-colosseum-dev

# Create structure
mkdir -p docs/{planning,architecture,guides}
mkdir -p scripts
mkdir -p SESSIONS

# Move planning docs (preserves git history)
git mv packages/agent-provisioning/3DAY_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/*PLAN*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/ACTION_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/FINAL_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/CRITICAL_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/REALITY_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/START_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/IMPLEMENTATION_*.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/FILES_CREATED.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/NEXT_STEPS.txt docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/SPEC_KIT_SUMMARY.md docs/planning/ 2>/dev/null || true
git mv packages/agent-provisioning/WEBAPP_PLAN.md docs/planning/ 2>/dev/null || true

# Move architecture doc
git mv AGENT_UX_ARCHITECTURE.md docs/architecture/ 2>/dev/null || true

# Commit
git add docs/ SESSIONS/ scripts/
git commit -m "chore: reorganize repo structure

- Move 16 planning docs to docs/planning/
- Move architecture doc to docs/architecture/
- Create SESSIONS/ for daily summaries
- Create scripts/ for utilities

Reduces clutter in root and packages/."

echo "✓ Repo cleanup complete!"
```

---

## Result

**Before**: Messy root with 16 planning docs scattered  
**After**: Clean structure with clear separation of concerns

```
✓ Root clean (just README, CLAUDE.md, LICENSE)
✓ Packages focused on code (no planning docs)
✓ docs/ = all planning/architecture reference
✓ SESSIONS/ = daily session tracking
✓ scripts/ = dev utilities
```
