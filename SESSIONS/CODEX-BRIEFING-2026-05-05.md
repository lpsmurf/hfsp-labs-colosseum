# Codex (GPT-5) — Day 1 Briefing & Status

**From**: Claude (Orchestrator)  
**To**: Codex  
**Date**: 2026-05-05 04:45 UTC  
**Task**: Build Trial UI Frontend (React Chatbox)

---

## ✅ Your Dependencies (In Progress)

Kimi is currently building:
- Express server on :8787
- POST `/api/chat` SSE streaming endpoint
- Rate-limit + budget-guard middleware

**Status**: Kimi starts May 6 morning, should be done by ~noon UTC  
**ETA for your start**: May 6 12:00–14:00 UTC

---

## 🚀 Your Assignment (Do This Tomorrow)

Read this: `/Users/mac/claude/HACKATHON_AGENT_BRIEFS.md` — section **"CODEX (GPT-5) — Frontend / Chatbox UI"**

**Working Directory**: `/Users/mac/hfsp-agent-provisioning/services/webapp/`

Build these components in `src/`:
1. `hooks/useTrialChat.ts` — SSE consumer hook + quota management
2. `components/Chatbox.tsx` — Message input + send button
3. `components/MessageList.tsx` — User/Poly bubbles + markdown
4. `components/ToolCallCard.tsx` — Collapsible tool result cards
5. `components/PaywallModal.tsx` — 10-msg paywall → Phantom deploy
6. `pages/Try.tsx` — Hero + chatbox layout
7. Wire route into `App.tsx`

**Deliverable**: PR on `feat/trial-ui` branch

---

## 🎬 When to Start

**Do NOT start until**:
- [ ] Kimi's PR is merged (`feat/trial-api` → `main`)
- [ ] Backend server running locally at `localhost:8787/api/chat`
- [ ] You can curl the endpoint: `curl -X POST localhost:8787/api/chat ...`

**Signal to proceed**: Claude will ping you in Slack/Discord once Kimi's server is live

---

## 🔗 Backend API Contract

**Endpoint**: `POST http://localhost:8787/api/chat` (dev) or `https://clawdrop.live/api/` (prod)

**Request**:
```json
{
  "message": "what is sol price?",
  "sessionId": "user-session-id"
}
```

**Response** (SSE stream):
```
event: delta
data: {"text":"Here"}

event: delta
data: {"text":" is"}

event: delta
data: {"text":" the"}

...

event: done
data: {"remaining": 8, "input_tokens": 42, "output_tokens": 156}
```

**Tool calls appear in response**: Mastra will stream full assistant messages including tool use as JSON blocks.

---

## 📋 Design Requirements

- **Mobile-first**: Design at 375px, scale up
- **Dark mode**: Match suzi.trade aesthetic
- **No signup**: Anyone can try (IP-based quota)
- **Streaming visible**: Show tokens arriving in real-time
- **Paywall**: Show after 10 messages OR on 429 response

**Counter**: Display "X / 10 messages used today" in top-right  
**Phantom integration**: Use existing `usePhantomDeploy` hook from parent

---

## 📌 Key Files Reference

- Tools you'll call: `packages/trial-api/src/tools/` (sol-price, wallet-balance, etc.)
- Design ref: [suzi.trade](https://suzi.trade) — study their mobile chat UX
- Phantom hook: `/packages/agent-provisioning/services/webapp/src/hooks/useDeployment.ts`
- Existing components: shadcn/ui (already installed in webapp)

---

## 🎯 Verification Checklist

Before finishing, verify:
- [ ] `npm run dev` — localhost:3000 (or :5173 if Vite)
- [ ] Visit `/try` route → chatbox loads
- [ ] Type message → sends to `localhost:8787/api/chat`
- [ ] Stream visible (tokens arrive one by one)
- [ ] After 10 messages → paywall modal appears
- [ ] Mobile: Test on actual iPhone or Chrome DevTools (375px)
- [ ] Lighthouse mobile score > 80

---

## 🎬 When Done

1. Commit to `feat/trial-ui` branch
2. Create PR: "feat(trial-ui): Chatbox UI + SSE consumer + paywall"
3. **Run session closer**:
   ```bash
   cd /Users/mac/hfsp-labs-colosseum
   ./scripts/session-closer.sh "Codex: Chatbox UI + SSE hooks + paywall modal"
   ```
4. Leave PR comment: `@claude ready for review — tested on mobile at 375px`

---

## ⛔ Blockers & Fallbacks

**Blocker 1**: Kimi's server not ready  
→ **Fallback**: Mock `/api/chat` endpoint locally to unblock UI work

**Blocker 2**: Tool call format unclear  
→ **Reference**: Check `packages/trial-api/src/server.ts` once merged, or ask Claude

**Blocker 3**: Phantom integration  
→ **Reference**: Study existing `usePhantomDeploy.ts` (already in webapp)

---

## 🚀 Critical Path

```
Kimi (start May 6 9am)
  ↓ (backend ready ~noon)
  └─→ YOU (start May 6 noon)
       ↓ (UI done ~Friday morning)
       └─→ Gemini (records video ~Friday noon)
            ↓ (launch ~Friday 4pm UTC)
```

You have 36 hours. Main work is ChatBox + MessageList (90% of effort).

---

**Next**: Gemini will wait for a working UI before recording the demo video.  
**Blocker Chain**: OpenRouter → Kimi → You → Gemini (Friday launch)

Good luck! 🚀
