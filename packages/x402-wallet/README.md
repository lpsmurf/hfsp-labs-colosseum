# x402-wallet

Agent wallet dashboard for tracking autonomous x402 USDC payments on Solana.

## What It Does

- Track multiple AI agents and their wallet balances
- View all x402 USDC payments made by each agent
- Spend analytics — by product, time period, agent
- Auto-import recent transactions from Helius

## Stack

- Next.js 14 (App Router)
- SQLite via better-sqlite3 (local, no external DB)
- Helius RPC for Solana transaction history
- Tailwind CSS

## Setup

```bash
npm install
cp .env.example .env
# Fill in HELIUS_API_KEY
npm run dev
# http://localhost:3006
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `HELIUS_API_KEY` | Yes | Helius API key for Solana RPC + tx history |
| `DATABASE_PATH` | No | SQLite path (default: `./data/wallet.db`) |

## Contact

HFSP Labs · [info@hfsp.xyz](mailto:info@hfsp.xyz)
