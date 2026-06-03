# Clawdrop — OOBE Protocol Bounty Submission

**Category:** Ace Data Cloud Usage (x402 Facilitator)
**Wallet:** `FEuTewmn9RdwexQnhvkCq7VaXfpnQL9qsYrTrCgTtk5e`
**SAP Agent ID:** `8m5MXkunTGabXKLrmVCj2WekLF4V2WwB3gKGuAc872rx`
**Live signals:** https://t.me/ClawdropSignal

---

## What It Does

Clawdrop is an **autonomous Solana AI agent** that has been running continuously for 53+ hours with zero human intervention.

Each cycle it:
1. Discovers available services via the **SAP on-chain registry**
2. Calls **Ace Data Cloud** APIs (Search + Chat) for real-time crypto intel
3. Pays per-call in **USDC via x402** — fully autonomous, no pre-authorization
4. Pushes trading signals to Telegram 24/7

**The problem it solves:** AI agents that need real-world data today either scrape free APIs (rate-limited, unreliable) or require pre-paid subscriptions. x402 lets agents pay exactly what they use, when they use it — like a credit card for AI.

---

## Proof at a Glance

| Metric | Value |
|---|---|
| x402 transactions on Solana mainnet | **54** |
| Ace Data Cloud services used | **2** (`search`, `chat`) |
| Continuous autonomous operation | **53+ hours** |
| Signals generated | **379** |
| SAP agents registered | **6** |
| Operation window | 2026-05-30 → 2026-06-01 |

**On-chain verification:**
- SAP Explorer: https://explorer.oobeprotocol.ai/agent/8m5MXkunTGabXKLrmVCj2WekLF4V2WwB3gKGuAc872rx
- Full transaction log: [docs/TRANSACTIONS.md](docs/TRANSACTIONS.md)
- Demo video (44s): [packages/oobe-bounty/demo_voiced.mp4](demo_voiced.mp4)
- asciinema recording: https://asciinema.org/a/BKdpHvCAjeWb6Ysi

---

## Architecture

```
Ace Data Cloud APIs  ←—x402 USDC payment—→  Clawdrop Agent
       ↑                                           ↓
  SAP Registry (discovers services)         Telegram signals
  (on-chain, Solana mainnet)               (t.me/ClawdropSignal)
```

**Key files for judges:**

| File | What to look at |
|---|---|
| [src/services/x402-payments.ts](src/services/x402-payments.ts) | x402 payment handler — HTTP 402 → USDC → retry |
| [src/services/ace-client.ts](src/services/ace-client.ts) | Ace Data Cloud API integration |
| [src/services/sap-registry.ts](src/services/sap-registry.ts) | SAP on-chain agent registration |
| [src/agents/price-monitor.ts](src/agents/price-monitor.ts) | Example autonomous agent loop |
| [src/server.ts](src/server.ts) | Express API + agent lifecycle |
| [docs/TRANSACTIONS.md](docs/TRANSACTIONS.md) | Full proof: 54 tx signatures + Solscan links |

---

## Run It Yourself

```bash
npm install
cp .env.example .env
# Fill in ACEDATA_API_KEY, WALLET_PRIVATE_KEY, SYNAPSE_RPC_URL, TELEGRAM_BOT_TOKEN
npm run dev
# API available at http://localhost:8788
# Health: curl http://localhost:8788/health
# Agents: curl http://localhost:8788/api/agents/status
# Payments: curl http://localhost:8788/api/payments
```

---

## SDK Contribution

While building this, we found and fixed 3 bugs in the official `@oobe-protocol-labs/synapse-sap-sdk`:

- **`fetchAccount`** silently swallowed RPC errors (returned `null` instead of throwing)
- **`buildTransaction`** dropped `lastValidBlockHeight` (tx confirmation would hang forever)
- **`sendTransaction`** returned before on-chain confirmation (x402 payment headers would fail verification)

PR submitted: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/pull/4

---

## Resources

- Monorepo: https://github.com/lpsmurf/hfsp-labs-colosseum
- Telegram signals: https://t.me/ClawdropSignal
- Ace Data Cloud: https://platform.acedata.cloud
- OOBE SAP Explorer: https://explorer.oobeprotocol.ai
