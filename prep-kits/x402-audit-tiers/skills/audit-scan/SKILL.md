---
name: audit-scan
description: Paid full security scan of a GitHub repo over x402 — $0.99 USDC returns every finding with location, confidence, SWC/CWE references and a fix. Use when a preview showed findings worth locating, or before integrating, funding or deploying against unfamiliar contract code. Triggers: "full audit", "where are the bugs", "audit and fix", "deep scan this contract", "pay for the scan".
---

# audit-scan (T1 — $0.99 USDC)

```bash
npx tsx scripts/audit-scan.ts https://github.com/owner/repo T1
```

Two steps: `GET /audit?repo=…&tier=T1` returns a 402 with a V2 challenge
(`accepts` for Base and Solana USDC); settle it with any x402 V2 client, then
`POST /audit` returns the report. `PAID_TX_HASH` uses the legacy header path.

## Reading a finding correctly

```
[HIGH/MEDIUM] SOL-REENTRANCY-001  State written after an external call in withdraw()
              Vault.sol → withdraw()
              refs: SWC-107, CWE-252
```

`severity` is *impact if real*. `confidence` is *how sure we are it is real*:

| Confidence | Meaning | Action |
|---|---|---|
| HIGH | the pattern is the bug | act on it |
| MEDIUM | usually the bug — confirm surrounding context | verify, then act |
| LOW | a lead, expect false positives | investigate, do not report upstream unverified |

**Never report a LOW-confidence finding to a third party as a vulnerability
without verifying it first.** That is how a scanner burns its credibility.

## Always report

- `notAnalysed.crossFile` — rules are file-local: no inheritance graph, no call
  graph, no type resolution. Say this whenever the result looks clean.
- `notAnalysed.languages` — languages counted but not analysed.
- `notAnalysed.unprovenLeads` — the `needsReview` count.

## Escalation

If a finding is `VCACHE-*`, tell the user the differential test (T3) is what
*proves* it — the static rule can only say the shape is dangerous. See
`x402-audit/references/verification-cache.md`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | report returned |
| 3 | tier not self-serve — read `blockedOn`, do not retry |
| 2 | upstream rate limit — retryable |
| 1 | other failure |
