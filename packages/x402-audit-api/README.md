# x402-audit-api

Pay $0.99 USDC on Base to get an automated security audit of any public x402 GitHub repo.

**Built by [HFSP Labs](https://hfsp.xyz) · [info@hfsp.xyz](mailto:info@hfsp.xyz)**

---

## What It Does

1. Caller pays $0.99 USDC via x402 on Base
2. Server clones the target GitHub repo
3. Runs static analysis (CORS misconfiguration, payment bypass patterns, hardcoded secrets)
4. Runs dynamic probes against live endpoints
5. Returns a structured JSON findings report with severity ratings

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service discovery doc |
| `POST` | `/audit` | Submit repo for audit (x402 gated) |
| `GET` | `/health` | Health check |

## Setup

```bash
cp .env.example .env
# Fill in PAYMENT_RECIPIENT, GITHUB_TOKEN (optional), ACEDATA_API_KEY (optional)
npm install
npm run dev
```

## Findings from the x402 Ecosystem Audit

See [`../../x402-audit/findings/`](../../x402-audit/findings/) for all published disclosures.

---

## Contact / Donations

HFSP Labs · [info@hfsp.xyz](mailto:info@hfsp.xyz)

| Chain | Address |
|-------|---------|
| **Solana** | `ALDJCQEjFeSBqd5WbECpYaKcfxfhNvpF4hxrg95x8vRL` |
| **EVM** | `0x002e76fEdb2014d24AB6032998BD9F406b322bDF` |
| **Bitcoin** | `bc1pt6u3cgad70w5yypdkrdphdfqzmyrvjdljqxpz7r2neday2kjtj9qh4kfyd` |
