# OpenClaw Agent UX & Capability Architecture

**Status**: Proposal (Plan only — no implementation)  
**Date**: April 22, 2026  
**Scope**: User interaction design + wallet integration + skill orchestration for deployed agents  

---

## 🎯 Core Vision

When an OpenClaw agent boots, it should know three things about itself, **in this order**:

1. **WHO I am** — Name, owner, personality, deployment ID
2. **WHAT I have** — Wallet address, SOL balance, spending policy
3. **WHAT I can do** — Installed MCP skills + how to compose them

Then: "How can I help you?" via the user's preferred channel (Telegram, Web, Voice).

---

## 🏗️ Proposed Architecture (5 Layers)

```
┌─────────────────────────────────────────────────────┐
│ Layer 5: USER INTERFACE                             │
│  Telegram | Web Chat | Voice | Mobile App           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Layer 4: AGENT BRAIN (Planner + Memory)             │
│  • LLM router (Claude/GPT/Gemini per task)          │
│  • Task decomposer                                  │
│  • Memory (user prefs, past actions, context)       │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Layer 3: SKILL BUS (MCP Orchestration)              │
│  Travel | DAO | Trading | Research | Treasury       │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Layer 2: WALLET & POLICY ENGINE                     │
│  • AI-native embedded wallet                        │
│  • Spending limits & approval rules                 │
│  • Multi-chain (Solana primary)                     │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Layer 1: AGENT IDENTITY (Self-Awareness Manifest)   │
│  Injected at deployment via system prompt +         │
│  capabilities.json served from MCP                  │
└─────────────────────────────────────────────────────┘
```

---

## 🔑 Layer 1: Self-Awareness at Deployment

**Problem**: Agent doesn't currently know what it has when it boots.

**Solution**: Deployment injects a **Self-Manifest** — a JSON + system prompt the agent reads first:

```json
{
  "identity": {
    "name": "Poli",
    "deployment_id": "ocl_abc123",
    "owner_wallet": "7qj...",
    "tier": "Dedicated",
    "personality": "helpful crypto-native assistant"
  },
  "wallet": {
    "address": "AgentPubKey...",
    "balance_sol": 2.5,
    "balance_usdc": 450,
    "spending_policy": {
      "per_tx_limit_usd": 200,
      "daily_limit_usd": 1000,
      "requires_approval_above_usd": 100
    }
  },
  "skills": [
    {"name": "travel_booking", "version": "1.0", "tools": ["search_flights", "search_hotels", "book"]},
    {"name": "dao_tools", "version": "1.0", "tools": ["create_dao", "setup_treasury", "launch_token"]},
    {"name": "trading_signals", "version": "1.0", "tools": ["get_signals", "backtest", "execute_swap"]}
  ],
  "user_channels": ["telegram://hfsp_minibot", "web://app.hfsp.cloud"]
}
```

The system prompt wraps this into: *"You are Poli, you have X SOL, you can do Y. The user just connected. Greet them and list your top 3 offerings."*

---

## 💰 Layer 2: Wallet Recommendation

**Recommended: Turnkey or Crossmint for AI-native wallets**

| Option | Best For | Pros | Cons |
|--------|----------|------|------|
| **Turnkey** ⭐ | Programmatic control | Policy engine, MPC, no seed phrase risk | Needs integration work |
| **Crossmint** ⭐ | Fast integration | SDK handles everything, embedded UX | Less policy flexibility |
| **Privy** | Web3 users | Social login, familiar UX | More consumer-focused |
| **Coinbase CDP** | USDC-heavy flows | Native USDC, on-ramps | Less Solana-focused |
| Self-custody (current) | Power users | Full control | Agent can't act autonomously |

**Recommendation: Turnkey** — because it has a **policy engine** that maps perfectly to your spending-limit use case (per-tx limits, daily caps, approval thresholds). The agent gets an API key scoped to its policy; it literally cannot exceed limits even if jailbroken.

**Fallback**: Start with a Solana keypair + local policy enforcement in clawdrop-mcp, migrate to Turnkey when you have budget.

---

## 🧩 Layer 3: Skill Bus (MCP Bundles)

You already have the foundation (capability bundles). Extend to **3 production bundles**:

### Bundle A: `travel_booking`

Tools the agent needs:
- `search_flights(origin, dest, dates, budget)` → Duffel API or Kiwi API
- `search_hotels(location, nights, stars, max_price, max_distance_from)` → Booking.com API or Amadeus
- `search_events(topic, location, date_range)` → Luma + Eventbrite + custom crypto-conf list
- `pay_with_crypto(invoice, amount)` → Sphere Pay, Helio, or crypto-to-fiat bridge (Ramp, MoonPay)
- `geocode(address)` → Mapbox for "10 min from event" distance calc

### Bundle B: `dao_treasury`

- `create_dao(name, members, threshold)` → Realms SDK (Solana native)
- `create_multisig(members, threshold)` → Squads Protocol
- `launch_token(name, supply, curve)` → Meteora DLMM or pump.fun
- `set_spending_policy(limits, categories)` → Streamflow or custom
- `setup_governance(voting_type, quorum)` → Realms governance
- `create_vesting_schedule(beneficiary, cliff, duration)` → Streamflow

### Bundle C: `trading_alpha`

- `get_market_data(token, timeframe)` → Birdeye + Jupiter API
- `scan_narratives()` → DefiLlama + Dune + custom social scraper
- `generate_signals(strategy, risk)` → Custom ML + TradingView webhooks
- `backtest(strategy, period)` → Custom engine
- `execute_swap(from, to, amount, slippage)` → Jupiter aggregator
- `set_stop_loss(position, trigger_price)` → Limit order via Jupiter

**Bundle format stays as-is** (MCP servers dropped into the container at deployment).

---

## 🧠 Layer 4: The Agent Brain

This is the piece you don't have yet. Recommend a **lightweight orchestrator** inside the OpenClaw container:

**Components**:
1. **LLM Router** — pick model per task
   - Claude Sonnet 4.6: planning, reasoning, tool composition
   - Haiku 4.5: quick replies, simple lookups (cheaper)
   - Gemini 3 Pro: long context (multi-hour research)

2. **Task Decomposer** — turns "book me Miami" into a DAG:
   ```
   Root: "Miami trip planning"
   ├── Find conference dates → search_events()
   ├── Parallel:
   │   ├── Find return flight → search_flights()
   │   └── Find hotel matching criteria → search_hotels()
   ├── Confirm with user (approval gate)
   └── Execute bookings → pay_with_crypto()
   ```

3. **Memory Store** — vector DB (Qdrant or Chroma) for:
   - User preferences ("I always fly aisle, middle-name is X")
   - Past actions ("You booked Marriott last trip")
   - Portfolio snapshots (for trading agent)

4. **Approval Gateway** — for any tx above policy threshold, post to Telegram: *"Book $847 flight + $1,240 hotel? Reply YES/NO"*

**Recommended framework**: Build on **Vercel AI SDK** or **Mastra** — both have native MCP support, streaming, memory, and agent loops. Don't roll your own.

---

## 📱 Layer 5: User Interface

**Primary**: Telegram (you already have `hfsp_minibot`) — crypto-native audience lives there.  
**Secondary**: Web chat at `app.hfsp.cloud` — for users who want dashboards.  
**Future**: Voice (ElevenLabs + Whisper) — "Hey Poli" mobile app.

**One-agent-multiple-channels** design: the agent's brain is the same; channels are just I/O.

---

## 🎬 The Three User Stories — How They'd Work

### Story 1: Miami Conference (Crypto Bro → Poli)

```
User (Telegram): "Hey Poli, I'm planning Miami next month..."

Poli's internal flow:
  1. Parse intent → TRAVEL_PLAN
  2. Extract entities:
     - destination: Miami
     - dates: [next month, conference-dependent]
     - hotel: 4-5 star, <$150/night, <10min from venue
     - flights: return, arrive D-1, depart D+1
  3. search_events("crypto conference", "Miami", "next month")
     → Returns: "Permissionless IV, May 20-22"
  4. Calculate dates: arrive May 19, depart May 23
  5. Parallel fan-out:
     - search_flights(origin=userPref, MIA, May 19-23)
     - search_hotels(Miami, 4 nights, 4-5★, <$150, <10min from venue)
  6. Rank options, present top 3 bundles
  7. User picks bundle → approval gate (total >$100 → confirm)
  8. pay_with_crypto(flight_invoice, hotel_invoice, ticket_invoice)
  9. Store in memory: "User attended Permissionless IV 2026"

Poli (Telegram reply):
"Found Permissionless IV in Miami May 20-22.
Best bundle:
✈️ AA return JFK-MIA May 19-23: $340 (paid in USDC)
🏨 Kimpton EPIC (5★, 7min walk): $142/night × 4 = $568
🎟️ Conference ticket: $599
Total: $1,507 USDC. Confirm? [YES] [NO] [SHOW MORE]"
```

**What you need**: Duffel API key, Booking.com API (or Amadeus partner), Luma API, Sphere Pay for crypto-to-fiat.

---

### Story 2: DAO Treasurer

```
User: "Set up a DAO with treasury, spending limits, governance, launch token"

Poli's flow:
  1. Interview mode — ask missing params:
     - "What's the DAO name?"
     - "Initial members + voting threshold?"
     - "Token ticker, supply, initial price?"
     - "Spending categories + limits?"
  2. Generate proposed config → show before deploying
  3. Execute in sequence (each is one MCP call):
     - create_dao(name, members) via Realms
     - create_multisig(members, 3/5 threshold) via Squads
     - launch_token(ticker, supply, curve) via Meteora
     - set_spending_policy({marketing: $5k/mo, dev: $20k/mo, ...})
     - setup_governance(type="token-weighted", quorum=10%)
  4. Return: Realms URL + Squads URL + token mint address + governance link
```

**What you need**: Realms SDK, Squads SDK, Meteora/pump.fun SDK, Streamflow for vesting.

---

### Story 3: Trading Agent

```
User: "Give me signals, strategies, prediction ideas"

Poli's flow (ongoing):
  1. On deploy, ask: "What's your risk profile? Capital? Timeframe?"
  2. Continuous loop:
     - scan_narratives() every 1h
     - get_market_data(watchlist) every 5min
     - generate_signals(strategy, risk) when triggers fire
  3. Push to Telegram: "🚨 WIF breaking resistance, vol +340%. Enter?"
  4. User approves → execute_swap() via Jupiter
  5. Auto-set stop_loss per policy
  6. Daily P&L digest at 9am user-tz
```

**What you need**: Birdeye API, DefiLlama, Dune, Jupiter aggregator, custom signal engine.

---

## 🔨 What You Need to Build (Ranked by Priority)

### **P0 — Blocks everything** (2 weeks)
1. **Self-Manifest injection** — extend `create_openclaw_agent` to write `/agent/manifest.json` + system prompt into container
2. **Wallet provisioning** — pick Turnkey or Crossmint, integrate into deployment flow
3. **Agent brain skeleton** — Mastra or Vercel AI SDK inside the container, reads manifest, exposes HTTP endpoint
4. **Telegram bridge** — route user messages from `hfsp_minibot` to agent's HTTP endpoint

### **P1 — One of three use cases live** (2 weeks — pick one)
5. **Travel bundle** (most demo-friendly) — Duffel + Booking + Luma + Sphere Pay
   OR
   **DAO bundle** (most crypto-native) — Realms + Squads + Meteora
   OR
   **Trading bundle** (most viral) — Birdeye + Jupiter + signal engine

### **P2 — Polish** (1 week)
6. **Approval gateway** — Telegram inline-button approvals for spending
7. **Memory layer** — Qdrant or Chroma for user prefs
8. **Web chat UI** — for users who prefer web over Telegram

### **P3 — Scale** (later)
9. Other two bundles
10. Voice interface
11. Mobile app

---

## 💡 Key Recommendations

1. **Don't build the brain from scratch.** Use Mastra or Vercel AI SDK. MCP support is native. You save 6 weeks.
2. **Pick ONE use case for v1.** Travel is the best demo (non-crypto-natives understand it). DAO is the most defensible (crypto-only can do it). Trading is the most viral. Ship one great, not three mediocre.
3. **Turnkey > self-custody** for this UX. Policy engine = sleep-at-night factor.
4. **Manifest-driven, not code-driven.** The agent's capabilities should be readable from a JSON file, not hardcoded. Adding skills = dropping an MCP in the bundle + updating manifest. No code changes.
5. **Telegram-first, not web-first.** Your audience is already there. Web chat is v2.
6. **Approval gates are a feature, not a friction.** Users trust an agent that asks before spending $1,500 more than one that just does it.

---

## 🎯 Suggested First Milestone (4 weeks)

**Goal**: Poli books a Miami trip end-to-end via Telegram, paying in USDC.

| Week | Focus |
|------|-------|
| **Week 1** | Self-manifest + Turnkey wallet + agent brain (Mastra) |
| **Week 2** | Telegram bridge + travel bundle (Duffel + Booking) |
| **Week 3** | Payment integration (Sphere Pay crypto→fiat) + approval gates |
| **Week 4** | Demo polish, memory layer, end-to-end testing |

**Success criteria**: Demo video of user typing one message → Poli books flight + hotel + ticket + pays → user gets confirmations in Telegram.

---

## ❓ Decisions You Need to Make

1. **Wallet provider?** Turnkey / Crossmint / self-custody
2. **Agent framework?** Mastra / Vercel AI SDK / custom
3. **First use case for v1?** Travel / DAO / Trading
4. **Timeline?** 4-week focused MVP or broader 8-week build
5. **Budget for APIs?** Duffel + Booking + Birdeye + Turnkey ≈ $300-800/mo to start

---

## 📚 Reference: API & SDK List

### Travel Bundle APIs
- **Flights**: Duffel, Kiwi, Amadeus
- **Hotels**: Booking.com, Amadeus, Agoda
- **Events**: Luma, Eventbrite, custom scraper
- **Crypto Payment**: Sphere Pay, Helio, Ramp, MoonPay
- **Geocoding**: Mapbox

### DAO Bundle SDKs
- **DAO Creation**: Realms (Solana)
- **Multisig**: Squads Protocol
- **Token Launch**: Meteora, pump.fun
- **Treasury**: Streamflow, Squads
- **Governance**: Realms, Snapshot

### Trading Bundle APIs
- **Market Data**: Birdeye, Jupiter, CoinGecko
- **Narratives**: DefiLlama, Dune Analytics, Twitter/X
- **Signals**: Custom (TradingView webhooks)
- **Backtesting**: Custom engine
- **Execution**: Jupiter aggregator
- **Stop Loss**: Limit orders via DEX

### Agent Frameworks
- **Mastra** (MCP-native, lightweight)
- **Vercel AI SDK** (streaming-first, memory)
- **LangChain / LangGraph** (heavier, more mature)

### Memory & Vector DB
- **Qdrant** (fast, Rust-based)
- **Chroma** (simple, Python-friendly)
- **Weaviate** (GraphQL, enterprise)

---

**End of proposal. Ready for decision & prioritization.**

