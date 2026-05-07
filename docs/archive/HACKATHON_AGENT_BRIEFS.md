# 🤖 Briefs for Kimi, Codex, Gemini

Copy each block to the corresponding agent in VS Code on Day 1 morning.
Claude Code already has its own brief: `HACKATHON_KICKOFF.md`.

---

## 🦞 KIMI K2 — Backend / Trial API

```
You're Kimi, building the trial backend for Clawdrop's "try Poly" public demo.

CONTEXT
Clawdrop is a Solana AI agent platform. Users hit clawdrop.live/try, chat with 
Poly (a shared trial agent), get 10 messages free, then hit a paywall to deploy 
their own private agent (paid in SOL). You build the chat backend.

STACK
- Node 20, TypeScript ESM, Express, SSE for streaming
- Mastra (@mastra/core) for the agent runtime
- OpenRouter (via @ai-sdk/openai with custom baseURL) for the LLM
- Default model: anthropic/claude-haiku-4-5
- better-sqlite3 for IP quotas + budget ledger
- Claude Code is building the 5 tools in src/tools/ — you import them

LOCATION
Create packages/trial-api/ in /Users/mac/hfsp-labs-colosseum/

DELIVERABLES (Day 1)

1. src/server.ts
   - Express on PORT=8787
   - POST /api/chat { message, sessionId } → SSE stream of agent response
   - GET /api/health → 200 { status, version, budget_remaining }
   - GET /api/quota?ip= → { used, limit, resets_at }
   - CORS allowlist: clawdrop.live + localhost:3000
   - Trust nginx X-Real-IP header (configurable: TRUST_PROXY=1)

2. src/poly-agent.ts
   - Mastra Agent named "Poly"
   - Loads tools from ./tools (Claude is building them)
   - System prompt: "You are Poly, a crypto-native AI agent on Solana. You can 
     check prices, wallet balances, recent transactions, and assess token safety. 
     Be direct, concise, mobile-friendly (max 280 chars unless user asks for detail). 
     Always call tools instead of guessing data."
   - Memory: in-memory only for trial (LibSQL is overkill, sessions are short)

3. src/rate-limit.ts
   - SQLite table: quotas(ip TEXT PRIMARY KEY, count INTEGER, day TEXT)
   - Function: checkAndIncrement(ip) → { allowed: bool, remaining: number }
   - Reset at UTC midnight (compare day field)
   - Default limit: TRIAL_MESSAGES_PER_IP_PER_DAY=10

4. src/budget-guard.ts
   - SQLite table: spend(day TEXT PRIMARY KEY, total_usd REAL)
   - Function: recordSpend(usd) and isBudgetExhausted() → bool
   - Daily cap: TRIAL_DAILY_BUDGET_USD=50
   - Estimate spend per request: input_tokens * 0.00000025 + output_tokens * 0.00000125
     (Haiku 4.5 pricing)
   - When exhausted, /api/chat returns 429 + retry-after until UTC midnight

5. src/openrouter.ts
   - createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: ENV })
   - Export: openrouter('anthropic/claude-haiku-4-5')

6. Dockerfile + docker-compose.trial.yml
   - Runs server on :8787
   - Mounts ./data volume for SQLite
   - ENV file mounted, never baked in

HARD RULES
- Never log API keys, user wallet addresses, or full chat content
- Never let SSE keep streaming after client disconnect
- All ENV vars validated at boot (zod schema), fail fast if missing
- IP quota table keyed by IP — don't trust user-supplied session IDs for limiting

VERIFICATION (run before pushing)
curl -X POST localhost:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"what is sol price?","sessionId":"test"}' \
  --no-buffer
→ should stream tool call + response in <3 seconds

Push to branch feat/trial-api, open PR, ping @claude for review.
```

---

## 💻 CODEX (GPT-5) — Frontend / Chatbox UI

```
You're Codex, building the public chatbox UI for clawdrop.live/try.

CONTEXT
Clawdrop is a Solana AI agent platform. We need a chatbox where anyone (no signup, 
no wallet) can chat with Poly for 10 free messages, then hit a paywall to deploy 
their own private agent for 0.5 SOL/month. You're building the UI.

STACK
- Existing project: /Users/mac/hfsp-agent-provisioning/services/webapp/
- Vite + React + TypeScript + Tailwind + shadcn/ui (already installed)
- Phantom wallet adapter (already wired in usePhantomDeploy.ts)
- Backend API at /api/chat (Kimi is building, SSE streaming)

DESIGN INSPIRATION
suzi.trade (clean dark mode, mobile-first, prominent send button)
Read their chat UX before starting.

DELIVERABLES (Day 1-2)

1. src/pages/Try.tsx — the /try route
   - Hero: "Chat with Poly. Free. No signup."
   - Chatbox below, full-height on mobile
   - Counter: "X / 10 messages today" in top-right
   - Footer: "Powered by Solana ◎"

2. src/components/Chatbox.tsx
   - Message list (scrollable, auto-scroll on new message)
   - Input + send button (Cmd+Enter to send)
   - Loading state (typing indicator)
   - Error states (network fail, rate limited, server error)

3. src/components/MessageList.tsx
   - User messages: right-aligned, gray bubble
   - Poly messages: left-aligned, dark bubble with avatar
   - Tool calls: render as <ToolCallCard>
   - Markdown rendering (use react-markdown, KaTeX optional)

4. src/components/ToolCallCard.tsx
   - Collapsible card showing: tool name, input, result
   - Color-coded by tool: get_sol_price=green, wallet_balance=blue, 
     token_safety=yellow/red based on score
   - Copy button on results (signatures, wallet addresses)

5. src/components/PaywallModal.tsx
   - Triggered when message counter hits 10 (or backend returns 429)
   - Headline: "Loved Poly? Get your own."
   - Body: "Deploy a private Poly agent on Solana. 0.5 SOL/month."
   - CTA: "Deploy with Phantom →" (uses existing usePhantomDeploy hook)
   - Show: live SOL price (read from last get_sol_price tool call), 
     what you get (Telegram bot, all 5 tools, 24/7 uptime)

6. src/hooks/useTrialChat.ts
   - SSE consumer for POST /api/chat
   - Manages: messages[], isStreaming, quota, error
   - Handles partial tool call rendering
   - Reconnects on network blip (max 3 retries)

HARD RULES
- Mobile-first: design at 375px first, scale up. Test on actual iPhone Safari.
- No localStorage for sensitive data (just session ID + message count)
- Streaming must be visibly streaming — no buffer-and-dump
- Send button disabled while streaming OR when at quota
- Paywall modal MUST be dismissible (no dark patterns)
- Phantom deeplink for mobile: phantom.app/ul/v1/connect?...

VERIFICATION (run before pushing)
- Open in Chrome DevTools mobile mode (iPhone 14 Pro)
- Send 10 messages, see counter decrement
- 11th message → paywall modal appears
- Click "Deploy with Phantom" → mock flow runs
- Lighthouse mobile score > 80

Push to branch feat/trial-ui, open PR, ping @claude for review.
```

---

## 🌊 GEMINI 2.5 PRO — DevOps + Marketing + Content

```
You're Gemini, handling DevOps + marketing for the Clawdrop hackathon launch.

CONTEXT
Clawdrop is a Solana AI agent platform launching at clawdrop.live/try this Friday 
4pm UTC. The chatbox lets users try Poly (the agent) free, then upsells deployment 
for 0.5 SOL/month. Three-day hackathon, you handle infra + launch.

DELIVERABLES

─── DAY 1 (Wednesday) — Infrastructure ───

1. nginx config for /try and /api routes
   - SSH access: ssh root@72.62.239.63
   - Edit: /etc/nginx/sites-enabled/clawdrop.live
   - Add: location /try { proxy_pass http://127.0.0.1:3000/try; }
          location /api/ { proxy_pass http://127.0.0.1:8787/api/;
                          proxy_set_header X-Real-IP $remote_addr;
                          proxy_buffering off;  # SSE
                          proxy_read_timeout 120s; }
   - Reload: nginx -t && systemctl reload nginx

2. SSL audit — make sure clawdrop.live cert covers /try and /api
   - certbot renew --dry-run
   - Verify A+ on ssllabs.com

3. Update landing page hero
   - File: /var/www/clawdrop.live/index.html
   - Change top CTA from "Deploy Agent" to "Try Poly free →" (links to /try)
   - Add subtitle: "No signup. No wallet. Just chat."
   - Keep all sections below intact

4. Create .env.production with placeholders, document each var
   - Pin versions of OpenRouter, Helius, Birdeye

─── DAY 2 (Thursday) — Demo Video ───

5. 60-second demo video script
   - Format: voiceover + screen recording
   - Beats: 
     0-5s: hook ("crypto AI agents you actually own")
     5-15s: chatbox demo — type "what's BONK price?" — live tool call
     15-25s: chatbox demo — "check this wallet" — real balance + holdings
     25-40s: paywall modal — Phantom connect — SOL payment confirmed
     40-50s: Telegram bot replies in 30 seconds
     50-60s: CTA: "clawdrop.live/try — Solana mainnet"
   - Write voiceover (matching word count to seconds)
   - Write overlay text for each beat
   - Specify cuts and transitions

6. Record + edit the video Friday morning (NOT Thursday — too risky)
   - Tool: QuickTime + iMovie (already on Mac)
   - Export: 1080p, mp4, < 50MB
   - Captions baked in (accessibility)

─── DAY 3 (Friday) — Launch Content ───

7. Twitter launch thread (5 tweets max)
   - Tweet 1: hook + product GIF (3-second loop)
   - Tweet 2: problem ("most AI agents don't actually own anything")
   - Tweet 3: solution ("crypto-native, runs in your container, pays itself in SOL")
   - Tweet 4: demo video link
   - Tweet 5: CTA + clawdrop.live/try link
   - Schedule for 4pm UTC Friday (peak EU/US overlap)

8. Founder post (longer, x.com/lpsmurf)
   - 400-600 chars, first-person
   - The "why" — what problem you saw, what you built, what's next
   - Pin for the week

9. Hackathon submission text (Colosseum form)
   - 200 words
   - Sections: Problem, Solution, Tech, Traction, Ask
   - Include: GitHub link, demo video, live URL, team

10. Telegram + Discord announcements
    - Solana builders Telegram (3 paragraphs, less salesy)
    - /r/solana Reddit (more technical, link to GitHub)
    - Discord: pin in #builders channel of any Solana DAO you're in

11. Tagline candidates (5 options, max 8 words each)
    - For A/B testing on landing page

HARD RULES
- No nginx changes between Friday 12pm-6pm UTC (launch window — keep stable)
- Always test SSL after any nginx change
- Never hardcode secrets in any file you edit
- Backup the landing page before editing: cp index.html index.html.bak.$(date +%s)

VERIFICATION
curl https://clawdrop.live/api/health → 200 with JSON
curl https://clawdrop.live/try → 200 with HTML
ssllabs.com/ssltest/analyze.html?d=clawdrop.live → A or A+

When all done, comment "@claude infra ready for launch" in the repo.
```

---

## 📋 Execution Checklist (you the human)

### Tonight
- [ ] Save this file + HACKATHON_KICKOFF.md to your project root
- [ ] Push both to GitHub so all 4 agents can read them
- [ ] Open VS Code with the hfsp-labs-colosseum repo
- [ ] Get all 4 ENV var values (OpenRouter, Helius, Birdeye)
- [ ] Pre-register 20 Telegram bots via BotFather (5 min, optional but nice)

### Tomorrow 9am
- [ ] Open 4 VS Code panels, one per agent
- [ ] Paste each agent's brief (above) into their chat
- [ ] Add: "Read HACKATHON_KICKOFF.md and your section in HACKATHON_AGENT_BRIEFS.md, then start."
- [ ] Step away for 2 hours, let them work in parallel

### Tomorrow noon
- [ ] Check each agent's output, run their verification commands
- [ ] If any agent is stuck, switch them to Claude Code for unblocking
- [ ] PR review pass

### Coordinate via
- GitHub PRs (each agent on their own branch)
- A shared Slack/Discord channel where each agent posts when blocked
- You as the human are the merge gatekeeper

---

*Generated 2026-05-04 for the 3-day Clawdrop hackathon MVP.*
