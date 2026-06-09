# x402-donate

x402-gated donation router on Base. Accepts USDC donations and routes them to Endaoment-registered charities with a 3% service fee.

**Built by [HFSP Labs](https://hfsp.xyz) · [info@hfsp.xyz](mailto:info@hfsp.xyz)**

---

## What It Does

1. Caller pays USDC via x402 on Base
2. Smart contract routes funds: 96.5% to charity, 3% service fee, 0.5% Endaoment admin
3. Returns a donation receipt with on-chain tx hash

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service discovery doc |
| `GET` | `/charities` | List supported Endaoment charities |
| `POST` | `/donate` | Submit donation (x402 gated) |
| `GET` | `/health` | Health check |

## Setup

```bash
cp .env.example .env
# Fill in ROUTER_CONTRACT_ADDRESS, ROUTER_PRIVATE_KEY, TREASURY_ADDRESS
npm install
npm run dev
```

## Architecture

```
Donor → x402 USDC payment → DonationRouter (Base) → Endaoment charity
                                                   → 3% HFSP Labs treasury
```

---

## Contact / Donations

HFSP Labs · [info@hfsp.xyz](mailto:info@hfsp.xyz)

| Chain | Address |
|-------|---------|
| **Solana** | `ALDJCQEjFeSBqd5WbECpYaKcfxfhNvpF4hxrg95x8vRL` |
| **EVM** | `0x002e76fEdb2014d24AB6032998BD9F406b322bDF` |
| **Bitcoin** | `bc1pt6u3cgad70w5yypdkrdphdfqzmyrvjdljqxpz7r2neday2kjtj9qh4kfyd` |
