# Kimi K2 — Day 1 Briefing & Status

**From**: Claude (Orchestrator)  
**To**: Kimi K2  
**Date**: 2026-05-05 04:45 UTC  
**Task**: Build Trial API Backend (Express + Mastra)

---

## ✅ Your Dependencies (Ready)

Claude has already completed:
- ✅ 5 Poly tools (sol-price, token-price, wallet-balance, recent-txns, token-safety)
- ✅ Tools package at `packages/trial-api/src/tools/`
- ✅ All tool types + helpers (`_helpers.ts`, `_cache.ts`)

**Location**: `/Users/mac/hfsp-labs-colosseum/packages/trial-api/src/tools/`

You can import them:
```typescript
import { getSolPrice, getTokenPrice, getWalletBalance, getRecentTxns, checkTokenSafety } from './tools/index.js';
```

---

## 🚀 Your Assignment (Do This)

Read this: `/Users/mac/claude/HACKATHON_AGENT_BRIEFS.md` — section **"KIMI K2 — Backend / Trial API"**

Build these files in `packages/trial-api/src/`:
1. `server.ts` — Express on :8787, POST /api/chat SSE
2. `poly-agent.ts` — Mastra Agent with all 5 tools
3. `openrouter.ts` — OpenRouter client
4. `rate-limit.ts` — SQLite IP quotas (10/day)
5. `budget-guard.ts` — SQLite spend cap ($50/day)
6. `Dockerfile` + `docker-compose.trial.yml`

**Deliverable**: PR on `feat/trial-api` branch

---

## ⛔ Blocker: OpenRouter Credits

**Status**: OpenRouter account has $0 balance  
**Solution**: Claude will fund it first thing tomorrow morning at openrouter.ai/settings/credits

**What this means for you**:
- You can write all the code today
- Can't test until credits are added (server will hang on API call)
- Once funded, run: `curl -X POST localhost:8787/api/chat ...`

**Fallback**: If credits aren't added by noon, swap to Anthropic API:
```bash
npm install @ai-sdk/anthropic
# Update openrouter.ts to use Anthropic instead
```

---

## 📋 Verification Checklist

Before finishing, verify:
- [ ] `npm run build` — TypeScript clean
- [ ] `npm run dev` — server boots on :8787
- [ ] GET `/api/health` returns 200 with `{status, budget_remaining}`
- [ ] GET `/api/quota?ip=127.0.0.1` returns quota object
- [ ] POST `/api/chat` SSE headers sent (even if LLM hangs due to no credits)

---

## 🎬 When Done

1. Commit to `feat/trial-api` branch
2. Create PR: "feat(trial-api): Poly backend + rate-limit + budget"
3. **Run session closer**:
   ```bash
   cd /Users/mac/hfsp-labs-colosseum
   ./scripts/session-closer.sh "Kimi: Trial API backend server + Mastra integration"
   ```
4. Leave PR comment: `@claude ready for review — blocked on OpenRouter credits for e2e test`

---

## 🔗 Key Docs

- Full brief: `/Users/mac/claude/HACKATHON_AGENT_BRIEFS.md`
- Tools API: `packages/trial-api/src/tools/index.ts`
- Helius API key: `b72c1253-4c5d-441b-8b54-46b08d10d447` (already in Claude's .env)
- OpenRouter key: See Claude (needs funding)

---

## 📦 Dependencies Already Installed

Check `packages/trial-api/package.json`:
```json
"@ai-sdk/openai": "^1.1.0",
"@mastra/core": "^0.10.0",
"axios": "^1.7.0",
"better-sqlite3": "^9.4.0",
"express": "^4.18.0",
"zod": "^3.22.4"
```

All good — just `npm install` if you haven't yet.

---

**Next**: Codex will wait for your `/api/chat` endpoint before building the frontend.  
**Blocker Chain**: OpenRouter → You → Codex → Gemini (Friday launch)

Good luck! 🚀
