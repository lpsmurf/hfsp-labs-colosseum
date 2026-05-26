# OOBE Protocol Bounty Submission: Clawdrop Autonomous Agents

> 3 autonomous trading signal agents calling Ace Data Cloud APIs with on-chain x402 payment settlement

**Deadline:** May 31, 2026 (10 days)  
**Submission Category:** Ace Data Cloud Usage  
**Prize:** $700 (1st place)  

---

## Project Structure

```
packages/oobe-bounty/
├── src/
│   ├── services/
│   │   ├── sap-registry.ts         [CODEX] - Agent registration on Solana SAP
│   │   ├── x402-payments.ts        [CODEX] - On-chain payment settlement
│   │   └── signal-engine.ts        [CODEX] - Trading signal generation
│   │
│   ├── agents/
│   │   ├── price-monitor.ts        [CODEX] - Price feed API agent
│   │   ├── portfolio-analyzer.ts   [CODEX] - Analytics API agent
│   │   └── sentiment-monitor.ts    [CODEX] - Sentiment API agent
│   │
│   ├── distribution/
│   │   ├── twitter-bot.ts          [KIMI] - Twitter signal posting
│   │   ├── telegram-bot.ts         [KIMI] - Telegram signal distribution
│   │   └── index.ts                [KIMI] - Bot orchestration
│   │
│   ├── db/
│   │   ├── schema.ts               [CODEX] - SQLite schema + migrations
│   │   └── migrations.ts           [CODEX] - DB initialization
│   │
│   └── server.ts                   [CODEX] - Express API + agent lifecycle
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   └── TRANSACTIONS.md             [Proof doc, generated Day 8-9]
│
├── scripts/
│   ├── deploy-agents.sh
│   ├── verify-sap.sh
│   └── collect-proof.sh
│
├── docker/
│   ├── Dockerfile.agent
│   └── docker-compose.bounty.yml
│
├── data/                           [Generated at runtime]
│   └── bounty-vault.db            (SQLite: agents, payments, signals)
│
├── .env                            [Your secrets - .gitignore'd]
├── .env.example
├── package.json
├── tsconfig.json
└── README.md (this file)
```

---

## Team Assignment

### Codex (Backend) — Days 1-10
**Deliverables:**
- SAP agent registry + 3 agents on Solana mainnet
- x402 payment handler (150+ transactions)
- Signal engine (48+ signals over 48h)
- Three autonomous agents (price, portfolio, sentiment)
- Express API server + health endpoints
- Proof collection: transaction signatures + metrics

**Handoff:** [OOBE_BOUNTY_CODEX_BACKEND.md](/.claude/handoffs/OOBE_BOUNTY_CODEX_BACKEND.md)

### Kimi (Distribution) — Days 1-10
**Deliverables:**
- Twitter bot (@ClawdropSignals) → 48+ posts, 100+ followers
- Telegram bot (@ClawdropSignals) → 48+ messages, 100+ members
- Real-time signal distribution (signal → Twitter/Telegram within 5 min)
- Demo video (3 min showing end-to-end flow)
- Proof collection: engagement metrics, video link

**Handoff:** [OOBE_BOUNTY_KIMI_DISTRIBUTION.md](/.claude/handoffs/OOBE_BOUNTY_KIMI_DISTRIBUTION.md)

---

## Quick Start

### 1. Install Dependencies

```bash
cd packages/oobe-bounty
npm install
```

### 2. Setup Environment

```bash
# Copy template
cp .env.example .env

# Fill in:
# - ACEDATA_API_KEY (from Ace Data Cloud)
# - ACEDATA_FACILITATOR_ADDRESS (from Ace settings)
# - WALLET_PUBLIC_KEY, WALLET_PRIVATE_KEY (your Solana wallet)
# - TWITTER_API_KEY, TWITTER_BEARER_TOKEN, etc (from Twitter Dev)
# - TELEGRAM_BOT_TOKEN (from Telegram BotFather)

vim .env
```

### 3. Run Dev Server

```bash
npm run dev
# Listens on http://localhost:8788
# Agents start automatically
# Bots poll every 2 min
```

### 4. Verify Setup

```bash
# Health check
curl http://localhost:8788/health

# Check agent status
curl http://localhost:8788/api/agents/status

# Check signals (should populate after 1h)
curl http://localhost:8788/api/signals?hours=1

# Check payments (should see x402 transactions after 1h)
curl http://localhost:8788/api/payments?hours=1
```

---

## Daily Checkpoints

**Day 1 (Now):**
- ✅ Project scaffolded
- ✅ Dependencies installed
- Codex: Start sap-registry.ts
- Kimi: Create Twitter/Telegram accounts

**Day 2:**
- ✅ Codex: First agent registers on SAP
- ✅ Kimi: Bots initialized locally, test post works
- Sync: Verify signals flow from Codex → posted by Kimi

**Day 3:**
- ✅ Codex: First x402 payment confirmed on Solscan
- ✅ Kimi: Live bot posting to Twitter/Telegram
- Check: 1+ tweets, 1+ Telegram messages

**Day 4:**
- ✅ All 3 agents running autonomously
- ✅ Signals generated every hour
- ✅ Twitter/Telegram posting every signal
- Check: 4+ tweets, 4+ messages in Telegram

**Day 5:**
- ✅ 12+ hours of activity
- ✅ 12+ tweets
- ✅ 50+ transactions in DB
- Check: All timestamps logged correctly

**Day 6:**
- ✅ 24+ hours of activity
- ✅ 24+ tweets
- ✅ 100+ transactions verified on Solscan
- Check: 3 distinct services (price-feed, analytics, sentiment) used

**Day 7:**
- ✅ 36+ hours of activity
- ✅ Stop agents (ready for final collection)
- ✅ Start proof document compilation

**Day 8:**
- ✅ Record demo video (3 min)
- ✅ Collect transaction signatures (50+ sample)
- ✅ Compile metrics: tweets, followers, Telegram members
- ✅ Draft TRANSACTIONS.md proof document

**Day 9:**
- ✅ Final verification
- ✅ README + SETUP docs complete
- ✅ YouTube upload (demo video)
- ✅ All proof artifacts ready

**Day 10 (Submission):**
- Submit to OOBE bounty page
- Post to X (Twitter) with video + repo links
- Expected: $700 1st place or $500 2nd place

---

## Proof Artifacts (Collected Days 8-9)

### docs/TRANSACTIONS.md
**Contains:**
- 50+ x402 transaction signatures with amounts
- Timestamp range (48h+ coverage)
- Solscan links (proof of on-chain settlement)
- Distinct services used (price-feed, analytics, sentiment)
- Total SOL spent

### docs/SOCIAL-PROOF.md
**Contains:**
- @ClawdropSignals Twitter metrics:
  - Follower count (target: 100+)
  - Total tweets (target: 48+)
  - Engagement: likes, retweets
- @ClawdropSignals Telegram metrics:
  - Member count (target: 100+)
  - Total messages (target: 48+)
- Screenshots of both platforms

### Demo Video
- YouTube link (recorded Day 8-9)
- Shows:
  1. 3 agents on Synapse Explorer
  2. Signal generation → Twitter post (within 5 min)
  3. Same signal → Telegram message (within 5 min)
  4. x402 transaction on Solscan
  5. Proof: 150+ transactions, 3 services

---

## Success = 🏆

**Bounty Submission Checklist:**

- [ ] 3 SAP agents registered + visible on https://explorer.oobeprotocol.ai
- [ ] 150+ unique x402 transactions on Solana mainnet
- [ ] 3+ distinct Ace Data Cloud services proven (price-feed, analytics, sentiment)
- [ ] 48+ continuous hours autonomous operation (no manual intervention)
- [ ] 48+ tweets from @ClawdropSignals
- [ ] 100+ followers on Twitter
- [ ] 48+ messages in @ClawdropSignals Telegram
- [ ] 100+ members in Telegram channel
- [ ] Demo video recorded (3 min, YouTube link)
- [ ] docs/TRANSACTIONS.md with proof
- [ ] docs/SOCIAL-PROOF.md with metrics
- [ ] Bounty submission posted on X (Twitter)
- [ ] GitHub branch: `feat/oobe-bounty-submission`

---

## Integration Points

**Codex ↔ Kimi Sync:**

1. Shared database: `data/bounty-vault.db`
   - Codex writes: `agents`, `payments`, `trading_signals`
   - Kimi reads: `trading_signals`, writes posting status

2. Shared server: port 8788
   - Codex owns: `/api/agents/*`, `/api/payments/*`
   - Kimi uses: polling loop + `/api/proof`

3. Shared .env
   - Both read: `ACEDATA_*`, `WALLET_*`, `SOLANA_*`
   - Codex only: x402 keys
   - Kimi only: `TWITTER_*`, `TELEGRAM_*`

---

## Troubleshooting

### Agent Won't Start
```bash
# Check logs
npm run dev 2>&1 | grep ERROR

# Verify env vars
echo $ACEDATA_API_KEY
echo $WALLET_PUBLIC_KEY

# Check database
sqlite3 data/bounty-vault.db ".schema agents"
```

### Twitter Bot Not Posting
```bash
# Check tweets in DB
sqlite3 data/bounty-vault.db \
  "SELECT COUNT(*) FROM trading_signals WHERE posted_to_twitter = true;"

# Verify Twitter API credentials
echo $TWITTER_BEARER_TOKEN

# Test API directly
curl -H "Authorization: Bearer $TWITTER_BEARER_TOKEN" \
  https://api.twitter.com/2/tweets/recent_search?query=from:ClawdropSignals
```

### x402 Payment Failing
```bash
# Check wallet balance
solana balance $WALLET_PUBLIC_KEY

# Verify RPC connection
curl $SYNAPSE_RPC_URL -X POST \
  -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}'

# Check payment status in DB
sqlite3 data/bounty-vault.db \
  "SELECT status, error FROM payments ORDER BY created_at DESC LIMIT 1;"
```

---

## Resources

- **SAP SDK Docs:** https://explorer.oobeprotocol.ai/docs
- **Ace Data Cloud:** https://platform.acedata.cloud
- **x402 Spec:** https://github.com/OOBE-PROTOCOL/x402-synapse-rpc-server
- **Twitter API v2:** https://developer.twitter.com/
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Solana Explorer:** https://solscan.io (mainnet)
- **Synapse Explorer:** https://explorer.oobeprotocol.ai

---

## Next Steps

1. **Codex:** Read [OOBE_BOUNTY_CODEX_BACKEND.md](/.claude/handoffs/OOBE_BOUNTY_CODEX_BACKEND.md) → Start implementing sap-registry.ts
2. **Kimi:** Read [OOBE_BOUNTY_KIMI_DISTRIBUTION.md](/.claude/handoffs/OOBE_BOUNTY_KIMI_DISTRIBUTION.md) → Create Twitter/Telegram accounts
3. **Both:** Daily standups at 9 AM UTC
4. **Day 10:** Submit to bounty page + post on X

---

**Target:** Win $700, build viral trading signal community, launch paid Telegram tiers post-bounty

Let's go! 🚀
