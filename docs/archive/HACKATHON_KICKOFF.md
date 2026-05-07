# 🚀 Clawdrop Hackathon MVP — Claude Code Kickoff Brief

**You are Claude Code in VS Code. This is your full briefing — start here.**
You are one of 4 AI agents (Kimi, Codex, Gemini, you) building a 3-day hackathon MVP. This document is self-contained — you don't need prior chat context.

---

## 🎯 What We're Building

**Clawdrop** is a Solana-native AI agent platform. Users pay SOL, get a personal AI agent ("Poly") deployed in a Docker container with crypto capabilities + Telegram interface.

**The MVP this week**: Public chatbox at `clawdrop.live/try` where anyone can chat with a shared trial Poly (10 messages free), then hit a paywall to deploy their own private agent. Try-before-buy funnel.

**Hackathon deadline**: Sunday end-of-day. Launch Friday 4pm UTC.

---

## 🗺 Codebase Map (what exists, what's broken)

### Repos / paths
| Path | Purpose | State |
|---|---|---|
| `/Users/mac/clawdrop-mcp/` | MCP server (Solana payment, tier quoting) | ✅ WORKS — just patched, 11 tools live |
| `/Users/mac/hfsp-labs-colosseum/packages/clawdrop-mcp/` | Newer MCP fork w/ analytics, auth, payment, teams | ✅ Used in production |
| `/Users/mac/clawdrop/packages/openclaw/` | Docker container template (MCP + Telegram bot) | ⚠️ `bot.ts` is fake — pretends to call tools but doesn't |
| `/Users/mac/clawdrop/packages/mcp-wallet/` | Wallet/swap/balance handlers | ✅ Real implementations exist |
| `/Users/mac/hfsp-agent-provisioning/` | HFSP provisioning engine (storefront-bot, webapp, wizard) | ✅ Live, SQLite + encrypted secrets |
| `/Users/mac/hfsp-agent-provisioning/services/webapp/` | Vite frontend on port 3000 | ✅ Existing, will host `/try` page |
| `/var/www/clawdrop.live/` (on `72.62.239.63`) | nginx landing page | ✅ Live — needs hero rewrite |

### What's working
- MCP server starts cleanly, all 11 tools respond (tested with Python subprocess)
- Solana devnet payment flow via Helius RPC
- `list_tiers` / `quote_tier` SOL pricing via live Jupiter
- 4 tiers exist: Explorer ($29), Tier A ($100), Tier B ($200), Tier C ($400)
- VPS at `72.62.239.63` runs nginx + clawdrop.live
- SSH access: `ssh root@72.62.239.63` (key already on disk)

### What's broken / missing
- ❌ `bot.ts` doesn't actually call tools — it's pure roleplay (no tool definitions in Anthropic API call)
- ❌ USDC/USDT quotes fail (Jupiter has no USDC→SOL route — SOL-only payments for MVP)
- ❌ No public chatbox UI
- ❌ No trial backend with rate limiting
- ❌ Telegram tokens are required + manual (BotFather friction)
- ❌ No analytics on conversion

---

## 👤 YOUR ROLE — Claude Code (this session)

You're the **architect / smartest agent**. You have a 4-agent budget:
- **Kimi K2** — backend (trial-api, rate limiting, SQLite, Helius integrations)
- **Codex (GPT-5)** — frontend (chatbox React component, paywall modal, mobile)
- **Gemini 2.5 Pro** — DevOps + marketing (nginx, SSL, video, tweet thread, copy)
- **YOU (Claude Code)** — architecture decisions, the 5 Poly tools (correctness matters), code review of others' PRs, final QA

### Your specific deliverables (in priority order)

#### 🔴 PRIORITY 1 — Day 1 morning (build first)
**Build the 5 Poly trial tools** in `packages/trial-api/src/tools/`. These MUST work because the demo lives or dies on them.

Tools spec (read-only, no signing required):

```
1. get_sol_price()
   → returns { price_usd: number, change_24h_pct: number, source: 'jupiter' }
   → uses https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112

2. get_token_price({ symbol: 'SOL' | 'USDC' | 'BONK' | 'JUP' | 'HERD' | <mint> })
   → returns { symbol, price_usd, mint, source }
   → use Jupiter v6 price API; map symbol to mint via static table
   → HERD mint: 6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R

3. get_wallet_balance({ wallet: string })
   → returns { sol_balance: number, top_tokens: [{ mint, symbol, amount, value_usd }] }
   → uses Helius RPC: getBalance + getTokenAccountsByOwner
   → top 5 tokens by USD value, never returns private data
   → ENV: HELIUS_API_KEY

4. get_recent_txns({ wallet: string, limit?: number })
   → returns [{ signature, type, description, timestamp, value_sol }]
   → uses Helius: GET https://api.helius.xyz/v0/addresses/{wallet}/transactions
   → default limit 5, max 10
   → return human-readable descriptions, not raw program data

5. check_token_safety({ mint: string })
   → returns { score: 'green' | 'yellow' | 'red', signals: string[], holders: number, mint_authority: string|null }
   → heuristics: mint authority renounced? freeze authority renounced? 
     liquidity locked? top 10 holders concentration? age?
   → use Helius getAsset + getTokenLargestAccounts
```

**Deliverable**: 5 TypeScript files, each ~80-120 lines, with:
- Full type signatures (input/output Zod schemas)
- Error handling (network fail → safe fallback)
- 30-second in-memory cache for prices (avoid hammering APIs)
- Unit-style test in same file showing example call + expected output shape

**Where to put it**: Create `/Users/mac/hfsp-labs-colosseum/packages/trial-api/` (new package).

---

#### 🟠 PRIORITY 2 — Day 1 afternoon
**Architecture review**: Read Kimi's `trial-api/src/server.ts` once they finish. Check for:
- IP-based rate limiting actually works (not just header-trust — use `x-real-ip` from nginx)
- OpenRouter key is ENV only, never logged
- Hard daily budget cap (e.g., $50/day OpenRouter spend — kill switch)
- SSE stream handles client disconnect cleanly
- No SQL injection in SQLite quota table

**Deliverable**: Single review comment file `REVIEW_kimi_day1.md` — green-light or list 3 must-fix items.

---

#### 🟡 PRIORITY 3 — Day 2
**Code review Codex's chatbox**. Walk it on iPhone Safari yourself (use BrowserStack or your phone). Check:
- Streaming actually streams (no buffer-and-dump)
- Tool call cards are readable on 375px width
- Paywall modal doesn't break scroll on mobile
- Phantom deeplink works from mobile Safari (the trickiest part)

**Deliverable**: `REVIEW_codex_day2.md` with screenshots.

---

#### 🟢 PRIORITY 4 — Day 3 (Friday)
**Final QA walkthrough**. Run the entire funnel as a real user, with a real wallet, on a real phone. Time it. Note every friction point. Fix the top 3 yourself. Approve launch or block it.

---

## 🔑 Required ENV Vars (set in `.env` before starting)

```bash
# LLM
OPENROUTER_API_KEY=sk-or-v1-...        # https://openrouter.ai — top up $20

# Solana data
HELIUS_API_KEY=...                      # https://helius.dev free tier
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY

# Optional fallback
BIRDEYE_API_KEY=...                     # https://birdeye.so free tier (token metadata fallback)

# Trial limits
TRIAL_DAILY_BUDGET_USD=50
TRIAL_MESSAGES_PER_IP_PER_DAY=10
TRIAL_DB_PATH=./data/trial.sqlite

# Server
PORT=8787
NODE_ENV=production
```

---

## 🏗️ Required Folder Structure (create today)

```
hfsp-labs-colosseum/packages/trial-api/
├── package.json                # type: module, deps: express, @mastra/core, @ai-sdk/openai, zod, better-sqlite3, axios
├── tsconfig.json               # NodeNext modules, ES2022, strict
├── Dockerfile                  # node:20-alpine, port 8787
├── .env.example
├── data/                       # gitignored (SQLite lives here)
└── src/
    ├── server.ts               # Express + SSE — KIMI builds
    ├── poly-agent.ts           # Mastra agent definition — KIMI builds
    ├── rate-limit.ts           # IP quota via SQLite — KIMI builds
    ├── openrouter.ts           # AI SDK client config — KIMI builds
    ├── budget-guard.ts         # daily spend kill switch — KIMI builds
    └── tools/                  # ← YOU BUILD THIS DIRECTORY
        ├── index.ts            # exports all 5 tools as Mastra-compatible
        ├── sol-price.ts
        ├── token-price.ts
        ├── wallet-balance.ts
        ├── recent-txns.ts
        ├── token-safety.ts
        ├── _cache.ts           # 30s in-memory LRU cache
        └── _helpers.ts         # mint→symbol map, USD formatting
```

---

## 📐 The Tool Contract (for Mastra compatibility)

Each tool exports a Mastra `createTool()` object. Example shape:

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withCache } from './_cache.js';

export const getSolPrice = createTool({
  id: 'get_sol_price',
  description: 'Get the current price of SOL in USD with 24h change. Call this when user asks about SOL price.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    price_usd: z.number(),
    change_24h_pct: z.number().optional(),
    source: z.string(),
    cached: z.boolean(),
  }),
  execute: async () => {
    return withCache('sol_price', 30, async () => {
      // ... real implementation
    });
  },
});
```

The `description` is what the LLM reads to decide when to call. **Write descriptions like prompts** — the LLM will follow them literally.

---

## ⚠️ Hard Rules

1. **Never write user wallet keys to logs or DB.** Read-only tools only.
2. **Never let a tool return more than 4KB of text.** Truncate, summarize, paginate.
3. **Cache aggressively.** 30s for prices, 60s for token safety, 120s for txns. APIs will rate-limit you.
4. **Fail open on tool errors.** If Helius is down, return `{ error: "data temporarily unavailable" }` not a 500.
5. **No background jobs in trial-api.** Stateless request/response only. Subscription enforcer lives elsewhere.
6. **Budget kill switch is non-negotiable.** Once daily spend hits $TRIAL_DAILY_BUDGET_USD, return 429 to all chat requests until UTC midnight.

---

## 🧪 How to Verify You're Done (Day 1 EOD)

```bash
cd /Users/mac/hfsp-labs-colosseum/packages/trial-api
npm install
npm run build
node -e "
  import('./dist/tools/index.js').then(async ({ tools }) => {
    console.log('Loaded tools:', Object.keys(tools));
    const p = await tools.getSolPrice.execute({ context: {} });
    console.log('SOL price:', p);
    const b = await tools.getWalletBalance.execute({ 
      context: { wallet: '7qjXXdemoWalletAddressHere' } 
    });
    console.log('Balance:', b);
  });
"
```

If those two calls return real data, you've shipped Day 1. Push to GitHub branch `feat/trial-tools`, open PR, ping Kimi.

---

## 📅 3-Day Schedule

| Day | Morning | Afternoon | EOD |
|---|---|---|---|
| **Wed (D1)** | YOU: 5 tools<br>KIMI: server.ts + rate limit<br>CODEX: chatbox skeleton<br>GEMINI: nginx route + ENV | YOU: review Kimi<br>KIMI: budget guard<br>CODEX: SSE wiring<br>GEMINI: landing hero rewrite | `clawdrop.live/api/health` returns 200 + tools tested |
| **Thu (D2)** | YOU: review Codex<br>KIMI: subscription enforcer<br>CODEX: paywall modal + Phantom<br>GEMINI: video script | YOU: integration test<br>KIMI: tool reliability<br>CODEX: mobile responsive<br>GEMINI: tweet drafts | Full funnel works on staging |
| **Fri (D3)** | YOU: final QA<br>KIMI: bugfixes<br>CODEX: mobile polish<br>GEMINI: record demo video | YOU: approve launch<br>ALL: bug bash<br>GEMINI: schedule tweets | **LAUNCH 4pm UTC** |

---

## 🎯 Success Definition

By Sunday EOD:
- [ ] `clawdrop.live/try` is live and someone who isn't on the team has used it
- [ ] At least 100 unique IPs have tried the chatbox
- [ ] At least 1 paid deployment from a non-team wallet
- [ ] Hackathon submission complete on Colosseum with video link
- [ ] Twitter launch thread has > 50 likes

If all 5 hit, MVP is a success. If 3+ hit, ship-and-iterate. If <3, post-mortem and pivot.

---

## 🚨 Emergency Contacts (in this brief)

- **Repo**: github.com/lpsmurf/hfsp-labs-colosseum
- **Production VPS**: `ssh root@72.62.239.63`
- **MCP server location**: `/Users/mac/clawdrop-mcp/`
- **MCP shell wrapper**: `/Users/mac/clawdrop-mcp/bin/clawdrop-mcp.sh` (just patched, works)
- **Existing nginx config**: `/etc/nginx/sites-enabled/` on the VPS
- **Domain DNS**: Hostinger (you have API access via mcp__hostinger-api-mcp__* tools)

---

## 💬 START HERE (literally your first action)

1. Read this entire document. ✅
2. Read `/Users/mac/clawdrop-mcp/src/server/tools.ts` to see the existing tool patterns.
3. Create `/Users/mac/hfsp-labs-colosseum/packages/trial-api/` skeleton.
4. Build `tools/_cache.ts` and `tools/_helpers.ts` first.
5. Build `tools/sol-price.ts` (simplest tool, gets your loop dialed in).
6. Build the other 4 tools.
7. Write the verification script from above. Run it. Fix until green.
8. Push branch `feat/trial-tools`, comment "@kimi ready for server.ts" in repo.

**Time budget**: 4 hours for all 5 tools + verification. If you're past 5 hours on tool 3, stop and ask the user for help — something's blocking.

---

*This brief was generated by your Claude Code session on 2026-05-04. The hackathon starts tomorrow.*
