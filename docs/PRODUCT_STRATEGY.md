# Poly — Product Strategy

> **"While you sleep, your agent trades."**

---

## The Hook

> **Deploy your personal Solana AI agent in 60 seconds. No code. Your keys. Always on.**

Secondary variants:
- *"60+ Solana protocols. One AI agent. Zero code."*
- *"Stop watching charts. Start owning Solana."*
- *"The only Solana AI agent that lives on your servers — not ours."*

---

## Product Narrative

Most crypto users want automation. Most can't code. Those who can code spend weeks building and maintaining bots that break.

Poly changes this with a two-stage experience:

### Stage 1 — Try Poly (Free)
Users visit clawdrop.live/try and chat with Poly — a Solana-native AI agent that checks prices, inspects wallets, detects rug pulls, and fetches transaction history in real time. No wallet required. No commitment.

The chatbot isn't the product. It's the proof.

### Stage 2 — Deploy Poly (Paid)
Once a user is convinced, one click deploys their own autonomous Poly agent to Openclaw infrastructure — running 24/7, executing trades, monitoring portfolios, and rebalancing positions while the user does something else entirely.

The agent lives on their terms:
- Their choice of LLM (Claude, GPT-4, Gemini, Llama, or their own)
- Their API keys if they prefer (BYOK)
- Their private keys — never held or touched by Poly
- Fully isolated from other users

---

## Value Proposition

### For Traders & Portfolio Managers

| Pain | Poly's Solution |
|------|----------------|
| "I want to automate DeFi but I can't code" | One-click deployment, no dev skills needed |
| "I don't trust centralized bots with my keys" | Agent runs on your isolated server, your keys stay yours |
| "I want 24/7 monitoring but I sleep" | Autonomous agent runs continuously, acts on conditions |
| "Bots I use break all the time" | Built on SendAI's Agent Kit — 60+ audited Solana integrations |
| "I want to use a specific AI model" | Choose any LLM, or bring your own API key |

### For Developers

| Pain | Poly's Solution |
|------|----------------|
| "Building robust Solana bots takes weeks" | Pre-built production-ready integrations via SendAI Agent Kit |
| "Infrastructure management is a time sink" | Openclaw manages MCP server, storage, and uptime |
| "I want to extend with my own tools" | MCP-based architecture — add custom tools to your server |
| "I want a specific model or endpoint" | Custom LLM endpoint support out of the box |

---

## Competitive Positioning

### The Landscape

| Product | What They Do | Weakness |
|---------|-------------|----------|
| **Centralized trading bots** (3Commas, Botfans) | Cloud-hosted bots | They hold your keys. Trust risk. |
| **Custom code** (DIY) | Self-built bots | Requires dev skills and months of work |
| **Telegram/Discord bots** | Command-based actions | No autonomy, reactive only |
| **Generic AI agents** (LangChain templates) | Multi-purpose agents | Not Solana-native, no audited tools |
| **Poly** | Solana-native autonomous agent | — |

### Where Poly Wins

```
                    Poly    Centralized Bots    Custom Code    Generic AI
─────────────────────────────────────────────────────────────────────────
No Code Required     ✅           ✅                ❌             ❌
Your Keys Only       ✅           ❌                ✅             ✅
60+ Solana Protos    ✅           ❌                ❌             ❌
Choose Any LLM       ✅           ❌                ✅             ✅
Audited Tools        ✅           ❌                ❌             ❌
Fully Autonomous     ✅           ✅                ✅             ❌
One-Click Deploy     ✅           ✅                ❌             ❌
User Isolation       ✅           ❌                ✅             ✅
Extensible (MCP)     ✅           ❌                ✅             ✅
```

**Poly's unique position:** Privacy + Ease + Audited Solana Coverage — no one else has all three.

### Positioning Statement

> *Poly is the only Solana AI agent platform that combines no-code deployment, full key privacy, and audited DeFi integrations — letting anyone run a production-grade autonomous trading agent without writing a single line of code.*

---

## Monetization

### Model: Mandatory Base Tier + Optional LLM Costs

Every user pays a mandatory platform fee regardless of LLM setup.
This covers: MCP server hosting, isolated infrastructure, storage, monitoring, and support.
LLM costs are additional — only if users choose Poly's API keys.

```
Monthly Cost = Platform Fee (mandatory) + LLM Costs (if using Poly keys)
```

No exceptions. Even BYOK users pay the base fee — they are paying for the platform, not the tools.

---

### Pricing Tiers

| | STARTER | PRO | ENTERPRISE |
|---|---------|-----|------------|
| **Price** | $19/mo | $59/mo | Custom |
| **Agents** | 1 | 5 | Unlimited |
| **Storage** | 5 GB | 50 GB | Custom |
| **MCP Server** | Shared | Priority | Dedicated |
| **Support** | Email | Priority Email | Dedicated Manager |
| **Custom RPC** | ❌ | ✅ | ✅ |
| **White-label** | ❌ | ❌ | ✅ |
| **SLA** | Best effort | Best effort | 99.9% |

---

### LLM Options (Available on All Tiers)

**Option A — Use Poly's Keys (Default)**
Poly routes LLM calls. Token costs added on top of base fee.

| | Starter | Pro |
|---|---------|-----|
| Token Budget | 1M tokens/mo | 5M tokens/mo |
| Token Reset | Monthly | Monthly |
| Overage Rate | Full cost | 0.8x (20% discount) |
| Soft Warnings | 80%, 100%, 125% | 80%, 100%, 125% |

Supported LLM providers via OpenRouter:
- Claude (Haiku 4.5, Sonnet 4.6, Opus 4.7)
- GPT-4, GPT-4o, GPT-4 Turbo
- Gemini 2.0 Flash, Gemini Pro
- Llama 3.1 (70B, 405B)
- Mixtral, Command R+, and more

**Option B — Bring Your Own Keys (BYOK)**
Connect your existing provider API key. Poly routes calls through it.
You pay your provider directly. Platform fee still applies.

**Option C — Custom Endpoint**
Self-hosted LLM (Llama, Mistral, etc.) at your own URL.
Zero LLM costs. Platform fee still applies.

---

### Token Sharing & Reset Rules

- Tokens are shared across all agents in the account
- Budget resets monthly on the subscription billing date
- Agents share the pool — users optimize allocation themselves
- No hard cutoff on overage — agent stays running, overage is billed

---

### Why This Model Works

| Concern | How the Model Addresses It |
|---------|---------------------------|
| "Why pay for free tools?" | You pay for infrastructure, not tools (SendAI tools are open-source) |
| "I'll game the system with BYOK" | BYOK still pays the platform fee — no free MCP routing |
| "Costs are unpredictable" | Base fee is fixed; LLM costs only if using Poly keys |
| "I want to use GPT-4 not Claude" | Any provider supported — Poly is model-agnostic |
| "I already have OpenAI credits" | BYOK lets you use existing credits — just pay $19 base |

---

### Example Monthly Bills

```
Budget Trader — Starter + BYOK (own Anthropic key)
  Platform:   $19.00
  LLM:        $0.00  (they pay Anthropic directly)
  Total:      $19.00/mo

Active Trader — Starter + Poly Keys (Haiku 4.5)
  Platform:   $19.00
  Tokens:     900K tokens @ Haiku rates ≈ $0.90
  Total:      ~$20.00/mo

Professional — Pro + Poly Keys (Sonnet 4.6)
  Platform:   $59.00
  Tokens:     3.2M tokens @ Sonnet rates ≈ $48.20
  Total:      ~$107.00/mo

Power User — Pro + Poly Keys (GPT-4o) with overage
  Platform:   $59.00
  Budget:     5M tokens included
  Overage:    1.2M tokens @ 0.8x rate ≈ $14.40
  Total:      ~$130.00/mo

Enterprise — Custom + Custom Endpoint (self-hosted Llama)
  Platform:   Custom (e.g. $500)
  LLM:        $0.00  (self-hosted)
  Total:      Custom/mo
```

---

## Go-to-Market Strategy

### Phase 1 — Hook (Now)
**Goal:** Build audience, prove concept, generate word-of-mouth.

- **Venue:** clawdrop.live/try — free Poly chatbot (10 messages/day/IP)
- **Tactic:** Real Solana AI capabilities experienced in under 60 seconds
- **CTA:** "Want Poly running 24/7? Deploy your agent →"
- **Channels:** Solana Twitter/X, DeFi Discords, Colosseum hackathon community
- **Metric:** Trial usage volume, CTA click-through rate

### Phase 2 — Convert (MVP Launch)
**Goal:** Turn hooked users into paying subscribers.

- **Offer:** Early access — Starter at $9/mo for first 100 users
- **Trigger:** Users who hit the 10-message trial limit get immediate CTA
- **Message:** "You've seen what Poly can do. Now make it yours — deploy in 60 seconds."
- **Onboarding:** Email/wallet connect → pick plan → one-click deploy → agent live
- **Metric:** Trial-to-paid conversion (target: 5–10%)

### Phase 3 — Grow (Post-MVP)
**Goal:** Flywheel via community and referrals.

- **Referral program:** $20 credit per referred user who subscribes
- **Community:** Discord for users to share strategies, configs, and results
- **Social:** Encourage "my Poly agent did X this week" posts
- **SEO:** Target "Solana trading bot", "Solana AI agent", "autonomous DeFi agent"
- **Partnerships:** SendAI ecosystem, Helius, Jupiter, Phantom co-marketing

### Phase 4 — Enterprise (6–12 months)
**Goal:** Land protocol-level and institutional deals.

- **Target:** Solana protocols, market makers, crypto funds, exchanges
- **Offer:** White-label, dedicated infra, SLA, custom tool integrations
- **Channel:** Direct sales via Solana Foundation and Colosseum network
- **Metric:** Enterprise ACV (target: $10k+/year per account)

---

## Product Page Copy

### Hero

```
HEADLINE:
Your Solana AI Agent.
Deployed in 60 Seconds.

SUBHEADLINE:
Automate trading, monitor portfolios, and execute DeFi strategies 24/7
without writing a single line of code.
Your keys. Your LLM. Your rules.

[Try Free →]    [Deploy Your Agent]
```

### Three Core Promises

```
  NO CODE REQUIRED         YOUR KEYS ONLY          ALWAYS ON, 24/7
  ─────────────────        ──────────────           ───────────────
  Click deploy.            Your private keys        Your agent runs
  Your agent is live       never leave your         while you sleep,
  in 60 seconds.           machine. Ever.           trade, and live.
```

### Capabilities

```
  DeFi Trading                    Portfolio Management
  ✓ Token swaps via Jupiter        ✓ Real-time balance tracking
  ✓ Limit & market orders          ✓ Automated rebalancing
  ✓ Perpetual trading (Drift)      ✓ P&L monitoring
  ✓ LP provision (Raydium, Orca)   ✓ Multi-wallet support

  Safety & Research               Automation
  ✓ Rug pull detection             ✓ Condition-based execution
  ✓ Token safety scoring           ✓ Scheduled operations
  ✓ Transaction history analysis   ✓ Custom alert system
  ✓ Wallet inspection              ✓ Cross-protocol strategies
```

### Social Proof

```
  Built on SendAI's Solana Agent Kit
  60+ audited integrations · 100k+ developers · Apache-2.0 licensed

  Works with
  Jupiter · Raydium · Orca · Drift · Helius · Metaplex · Magic Eden
```

### FAQ

```
Q: Do you hold my private keys?
A: Never. Your keys stay inside your isolated server environment.
   Poly has zero ability to sign transactions on your behalf.

Q: What LLMs can I use?
A: Any. Claude, GPT-4, Gemini, Llama, Mistral — or bring your own
   API key, or connect a self-hosted endpoint. Poly is model-agnostic.

Q: What happens when I exceed my token budget?
A: Your agent keeps running. You receive warnings at 80%, 100%, and 125%.
   Overages are billed at your tier rate (Pro users get 20% off overage).

Q: Can I cancel anytime?
A: Yes. No lock-ins, no exit fees, no questions.

Q: What Solana protocols does Poly support?
A: Jupiter, Raydium, Orca, Meteora, Drift, Adrena, Lulo, Sanctum,
   Solayer, Metaplex, Tensor, Magic Eden, PumpFun, and 40+ more.

Q: Is this safe to use with real funds?
A: Poly uses production-tested, audited integrations via SendAI Agent Kit.
   Start small. Test on devnet first. Review agent activity regularly.
```

---

## Summary

| Area | Decision |
|------|----------|
| **Hook Sentence** | "While you sleep, your agent trades." |
| **Stage 1** | Free trial chatbot at clawdrop.live/try |
| **Stage 2** | One-click autonomous agent on Openclaw |
| **Monetization** | Mandatory base tier + optional LLM token costs |
| **LLM Strategy** | Multi-provider: Poly keys, BYOK, or custom endpoint |
| **Token Reset** | Monthly, shared across all user agents |
| **Tiers** | Starter ($19), Pro ($59), Enterprise (custom) |
| **Tools** | SendAI Agent Kit (60+ audited Solana integrations) |
| **Privacy** | Per-user isolated MCP server + encrypted keys |
| **Architecture** | MCP server per user (Model 3 — isolated + shared infra) |
| **GTM Priority** | Hook trial users → convert on limit → grow via community → enterprise |
