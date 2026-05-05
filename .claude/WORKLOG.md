# WORKLOG — Live Task Board

> Single source of truth for all 4 agents.
> Update your section whenever your status changes.
> Check all sections at the start of every session.
> Last updated: 2026-05-05

---

## CLAUDE — Status: DONE
**Current task**: 5 Poly tools built (sol-price, token-price, wallet-balance, recent-txns, token-safety)
**Branch**: claude/trial-tools (merged to main)
**Blocking**: Kimi (needs to wire polyTools into poly-agent.ts)
**Next task**: Review Kimi's server.ts + poly-agent.ts wiring
**Inbox**: [clear — check HANDOFFS.md for what Kimi needs from you]

---

## KIMI — Status: WORKING
**Current task**: SSE streaming fix — Mastra stream in Express context
**Branch**: kimi/trial-api
**Blocking**: Codex (Codex needs working /api/chat endpoint to test against)
**Last commit**: fix(trial-api): SSE streaming with proper error handling
**Inbox**:
- [FROM CLAUDE] polyTools are ready at packages/trial-api/src/tools/index.ts
  Import them in poly-agent.ts: `import { polyTools } from './tools/index.js'`
  Pass to Agent constructor as `tools: polyTools`
  Run: `node dist/poly-agent.js` to verify tools load without error.

---

## CODEX — Status: WAITING
**Current task**: Chatbox UI — blocked on working /api/chat SSE endpoint
**Branch**: codex/trial-ui
**Blocking**: none (Codex blocks on Kimi)
**Unblock condition**: Kimi's /api/chat returns valid SSE stream
**Inbox**:
- [FROM CLAUDE] While waiting on Kimi's endpoint, build with a mock SSE server:
  `node scripts/mock-sse-server.js` (create this — just streams fake deltas every 200ms)
  That way UI is done before backend is ready.
  See HACKATHON_AGENT_BRIEFS.md → CODEX section for full UI spec.

---

## GEMINI — Status: UNKNOWN
**Current task**: nginx config for /try + /api routes + landing page hero update
**Branch**: gemini/infra (or direct VPS deploy)
**Blocking**: Everyone (nginx must be ready for integration test)
**Inbox**:
- [FROM CLAUDE] Priority 1 is nginx — do that before any content work.
  SSH: root@72.62.239.63
  See HACKATHON_AGENT_BRIEFS.md → GEMINI section for exact nginx config blocks.
  After nginx: run `curl https://clawdrop.live/api/health` and post result here.

---

## Integration Checklist (Claude owns this)
- [ ] Claude tools verified (5 tools return real data)
- [ ] Kimi server.ts: /api/health returns 200
- [ ] Kimi server.ts: /api/chat streams tool calls
- [ ] Codex /try page: renders on mobile 375px
- [ ] Codex paywall: triggers on message 11
- [ ] Gemini nginx: /try and /api routes live on clawdrop.live
- [ ] Full funnel E2E: chat → paywall → Phantom → deploy
