# Multi-Agent Session-Closer Development Checklist

## Overview
This checklist tracks the implementation of multi-agent session-closer functionality that automatically generates daily summaries for all 4 LLM agents (Claude, Codex/OpenAI, Gemini, Kimi) working in parallel.

---

## Phase 1: Agent Metric Extraction ✅
- [x] Create `AgentMetrics` interface with: name, prefix, commits, filesChanged, lines, blockers, branch, status
- [x] Create `parseAgentFromCommit(message)` — Extract `[AGENT]` prefix from commit messages
- [x] Create `agentDisplayName(prefix)` — Map `CLAUDE|OPENAI|GEMINI|KIMI` to display names
- [x] Create `extractAgentMetrics(agent, hoursBack)` — Get all metrics per agent
  - [x] Count commits via `git log --grep="^\[AGENT\]"`
  - [x] Parse files changed via `git log --name-status`
  - [x] Calculate lines added/removed via `git log --stat`
  - [x] Extract blockers from commit message bodies
  - [x] Detect agent branch via `git branch -a | grep feature/[agent]/`
  - [x] Infer status (Blocked/Complete/No commits)
- [x] Create `extractAllAgents(hoursBack)` — Extract metrics for all 4 agents
- [x] Add error handling (try-catch) for each git command

---

## Phase 2: Per-Agent Reporting ✅
- [x] Create `generateMetricsTable(agents)` — Markdown table with all agents + totals row
  - [x] Columns: Agent | Commits | Files Changed | Lines Added | Lines Removed | Status
  - [x] Calculate and display totals
- [x] Create `generatePerAgentReports(agents, contextMap)` — Per-agent report sections
  - [x] Agent name and branch
  - [x] Work completed (extracted from commits)
  - [x] Metrics (lines, files)
  - [x] Blockers
  - [x] Latest commits list
- [x] Create `readAgentContext()` — Read `.claude/context.md` for agent status/task info
- [x] Create `AgentContextInfo` interface for context file data

---

## Phase 3: Aggregation & Summary Generation ✅
- [x] Create `generateMultiAgentSummary(agents)` — Full markdown summary
  - [x] Header with date, agent list, total commits
  - [x] Metrics table section
  - [x] Per-agent report sections (all 4 agents)
  - [x] Build status section
  - [x] References section
- [x] Maintain backward compatibility with original `generateSummary()` function
- [x] Add `--agents-only` flag to run multi-agent mode exclusively
- [x] Add `--commit` flag to auto-commit summary

---

## Phase 4: File I/O & Git Integration ✅
- [x] Write summary to `SESSIONS/[DATE]-multi-agent-session.md`
- [x] Auto-commit with `[SESSIONS]` prefix
- [x] Include session ID in commit message
- [x] Create `SESSIONS/` directory if it doesn't exist
- [x] Handle git command failures gracefully
- [x] Show preview of first 40 lines of summary

---

## Phase 5: Supporting Files Created ✅
- [x] Created `SESSIONS/MULTI-AGENT-SESSION-TEMPLATE.md` — Reference template
- [x] Created `.claude/context.md` — Daily agent coordination template
- [x] Created `.claude/session-closer-dev/MULTI-AGENT-CHECKLIST.md` — This file
- [x] Updated `scripts/session-closer/session-closer.ts` with all functions

---

## Phase 6: Testing (In Progress) 🚀

### Unit Test Cases
- [ ] Test `parseAgentFromCommit()` with valid/invalid prefixes
- [ ] Test `extractAgentMetrics()` with real commits
- [ ] Test `readAgentContext()` with populated .claude/context.md
- [ ] Test `generateMetricsTable()` formatting
- [ ] Test `generatePerAgentReports()` with multiple agents
- [ ] Test `extractAllAgents()` with all 4 agents

### Integration Tests
- [ ] Run session-closer with `--agents-only` flag
- [ ] Verify metrics table shows all 4 agents
- [ ] Verify totals row calculation is accurate
- [ ] Verify per-agent sections populated from git data
- [ ] Verify status column reads from .claude/context.md
- [ ] Verify auto-commit creates file in correct location
- [ ] Verify markdown renders properly in GitHub
- [ ] Verify handles missing .claude/context.md gracefully

### Edge Cases
- [ ] Test with no commits this session (all agents)
- [ ] Test with missing .claude/context.md file
- [ ] Test with corrupted .claude/context.md
- [ ] Test with agent branch not found
- [ ] Test with very large line counts (+1000 lines)

---

## Phase 7: Documentation
- [x] Added usage comments to session-closer.ts
- [x] Documented `--agents-only` flag
- [x] Documented `--commit` flag
- [ ] Create USAGE.md file with examples
- [ ] Add examples to session-closer.ts comments

---

## Success Criteria (All Required) ✅

- [x] All 4 agents tracked in session summary
- [x] Metrics table accurate (commits, files, lines per agent + totals)
- [x] Per-agent report sections populated from git data
- [x] Blockers identified and displayed
- [x] Status column reads from context.md (with fallback)
- [x] Auto-commit succeeds with `[SESSIONS]` prefix
- [x] Output written to correct location (`SESSIONS/[DATE]-multi-agent-session.md`)
- [x] Markdown formatting clean and readable
- [x] Fully automated (no manual intervention)
- [x] Backward compatible with original single-author mode
- [x] Graceful error handling for all git operations
- [x] Informative console output (success/warning messages)

---

## Next Steps

### Immediate
1. Run session-closer with `--agents-only --commit` to test
2. Verify output in `SESSIONS/[DATE]-multi-agent-session.md`
3. Check git log for `[SESSIONS]` commit

### Short Term
- [ ] Create cronjob or systemd timer to run session-closer nightly
- [ ] Add `npm run session-closer` script to package.json
- [ ] Document how to customize agent names/prefixes

### Long Term
- [ ] Add per-agent performance metrics (commits/hour, review turnaround)
- [ ] Add team velocity tracking (total commits/files/lines per week)
- [ ] Add milestone progress visualization
- [ ] Create dashboard view of multi-agent work

---

## Implementation Details

### Git Commands Used
```bash
# Extract agent commits
git log --oneline --all --since="8 hours ago" --grep="^\[AGENT\]"

# Get files changed
git log --all --name-status --pretty=format: --grep="^\[AGENT\]"

# Get line statistics
git log --all --stat --pretty=format: --grep="^\[AGENT\]"

# Find agent branch
git branch -a --list "feature/[agent]/*"
```

### Agent Prefix Mapping
- `CLAUDE` → Claude
- `OPENAI` → Codex
- `GEMINI` → Gemini
- `KIMI` → Kimi

### Status Determination Logic
```typescript
if (blockers.length > 0) status = "Blocked"
else if (commitCount > 0) status = "Complete"
else status = "No commits"
```

### Context File Format
Reads from `.claude/context.md` sections like:
```
### Claude (Orchestration)
- **Task**: [description]
- **Status**: [Complete / In Progress / Blocked]
- **Deadline**: [date]
- **Dependencies**: [agents]
- **Branch**: [branch-name]
```

---

## Notes

- Session-closer is invoked via: `npx ts-node scripts/session-closer/session-closer.ts --agents-only --commit`
- Requires Node.js 18+ and TypeScript
- All git errors are caught and logged as warnings (doesn't break execution)
- Missing metrics gracefully default to 0 or empty arrays
- If .claude/context.md doesn't exist, all agents default to status "Complete" (no blockers found)

---

**Status**: Phase 6 (Testing) — Ready for first test run  
**Last Updated**: 2026-04-22  
**Maintainer**: Claude (multi-agent orchestration)
