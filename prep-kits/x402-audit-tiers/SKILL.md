---
name: x402-audit-tiers
description: Pay-per-depth smart contract and API security auditing over x402. Use when an agent needs to security-audit a GitHub repo before deploying, integrating, or funding it — Solidity, Solana/Anchor, JS/TS, or bridge/sidechain code. Free preview returns severity counts; $0.99 returns full findings with SWC/CWE references and confidence levels. Triggers: "audit this repo", "is this contract safe", "security scan", "check for vulnerabilities", "review before I integrate", "scan this dependency", "proof before deploy".
---

# x402-audit-tiers

Depth-tiered security audit, paid per scan over x402. Load the module you need:

1. **Just want to know if there's anything there?** → `skills/audit-preview` — free, returns severity counts and language coverage. No payment, no titles.
2. **Need the actual findings?** → `skills/audit-scan` — $0.99 USDC, full findings with locations, confidence, SWC/CWE refs and fixes.
3. **Which tier does what / what costs what?** → `skills/audit-tiers` — the catalog, including tiers that are not self-serve yet.

## Golden rules

- **Preview first, then pay.** A free `audit-preview` tells you whether a paid scan is worth $0.99. Never pay before previewing on a repo you know nothing about.
- **Read `confidence`, not just `severity`.** A `HIGH/LOW` finding is a lead, not a bug. `summary.needsReview` counts every finding below HIGH confidence — those need a human or a deeper tier before you act on them.
- **Read `meta.coverage` before trusting a clean report.** Clarity and Move files are counted but have **no rules**, so zero findings on a Clarity repo means "not analysed", not "safe".
- **Read `notAnalysed` in the response.** Every T1 report states what it did not look at. A file-local scan cannot see across inheritance or call graphs; that is T2.
- **Never treat a passing scan as an audit.** T1 is a 30-second screen. It measurably finds pattern-shaped bugs and structurally cannot find logic bugs.
- **A 503 is not a failed audit.** It means the upstream GitHub budget is exhausted; retry after the window in `detail`.

## Tiers

| Tier | Price | Returns | Self-serve |
|---|---|---|---|
| T0 Preview | free | severity counts, coverage map | yes |
| T1 Instant scan | $0.99 USDC | full findings | yes |
| T2 Deep scan | $49 | + cross-file (Aderyn/Slither/Semgrep) | not yet |
| T3 Differential & fuzz | quote | + differential cache test, fuzzing | not yet |
| T4 Manual review | quote | + human review, signed report | not yet |

Tiers differ by **depth of analysis performed**, never by which findings are disclosed. If a tier's engines find a critical, that tier returns it.

## Payment

x402 V2. `GET /audit?repo=<url>&tier=T1` returns a 402 with a `PAYMENT-REQUIRED`
challenge carrying `accepts` entries for Base and Solana USDC. Pay with any V2
client (`@x402/fetch`), then the `POST` returns the report. Legacy `X-Payment:
<txHash>` still works and gets a receipt attached.
