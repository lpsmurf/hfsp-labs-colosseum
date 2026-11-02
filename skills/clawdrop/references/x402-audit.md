---
title: x402 Audit API
---

The x402 Audit API scans an x402-gated endpoint for security vulnerabilities.
Costs $0.99 USDC on Base or Solana mainnet.

Service URL: https://audit.hfsp.cloud

See full findings and reports at: `x402-audit/`

## Usage

```
POST /api/audit
{ "url": "https://your-x402-api.example.com/protected-endpoint" }

→ 402  { pay: { amount: 990000, amountUsd: "0.99", ... } }
→ (send 0.99 USDC)
→ POST /api/audit  X-Solana-Tx: <signature>
→ 200  { findings: [...], severity: "CRITICAL|HIGH|MEDIUM|LOW|INFO", report_id: "..." }
```

## Finding severity levels
- **CRITICAL** — Replay attack possible, wrong mint accepted, no finality check
- **HIGH** — Missing amount validation, ATA owner not verified
- **MEDIUM** — No payment expiry window, tx not checked for confirmation
- **LOW** — Suboptimal patterns (e.g., `transfer` vs `transferChecked`)
- **INFO** — Informational observations

See `x402-audit/findings/` for past disclosures.
