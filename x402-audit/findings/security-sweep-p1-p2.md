# Audit Finding: Security Sweep — P1 + P2 (83 services)

**Date:** 2026-06-05
**Auditor:** HFSP Labs
**Scope:** 26 P1 (>1k calls/30d) + 57 P2 (100–999 calls/30d) = 83 highest-traffic x402 services
**Method:** `scripts/security-probe.ts` — auth-bypass, method-confusion, crash-on-malformed, CORS, info-disclosure, payTo-collision. No valid payments sent.

---

## Headline

**No confirmed auth bypass and no confirmed secret leakage across 83 services.**
The x402 payment gate itself is holding up well — fake/empty/structured-fake `X-PAYMENT`
headers were correctly rejected everywhere. The real issues are **availability/robustness**
(services crash on malformed input) and **one CORS misconfiguration**, plus an
ecosystem-integrity observation (shared wallets across "distinct" vendors).

Two findings the automated scan flagged CRITICAL were **verified false positives** and are
documented below for honesty/repeatability.

---

## CONFIRMED Findings

### 1. Crash on malformed X-PAYMENT (5xx) — cluster of ~8 services · MEDIUM
A structured-but-invalid base64 `X-PAYMENT` payload triggers an unhandled 500/502 instead
of a clean 4xx. This is an availability surface (cheap to trigger) and a potential
info-disclosure vector if the 5xx body carries a stack trace.

| Service | Status | Notes |
|---------|--------|-------|
| skills.onesource.io | 502 | structured payload |
| proxy.suverse.io | 502 | structured payload |
| x402stock.xyz | 500 | structured payload |
| stablejobs.dev | 500 | shared infra* |
| stablepeopledata.dev | 500 | shared infra* |
| www.stablebrowser.dev | 500 | shared infra* |
| stableenrich.dev | 500 | shared infra* |
| api.agentwonderland.com | 500 | garbage payload |

\* The `stable*.dev` services fail identically → almost certainly one operator / one
codebase. Fixing the template fixes all of them. Recommended fix: wrap `X-PAYMENT`
decode/verify in try/catch and return `402` (or `400`) with a JSON error, never `5xx`.

### 2. CORS reflects arbitrary origin WITH credentials — gateway-dev.flamewire.io · HIGH
```
Origin: https://evil.example
→ access-control-allow-origin: https://evil.example
  access-control-allow-credentials: true
```
Reflecting an attacker origin while allowing credentials lets a malicious page read
authenticated responses. It is a `-dev` subdomain (lower blast radius) but the pattern
will carry to prod if templated. Fix: never combine reflected/`*` ACAO with
`Allow-Credentials: true`; pin an allowlist.

> `api.x-router.ai` was flagged by the scanner but **did not reproduce** on manual retry
> (no ACAO headers on the verification request) — likely load-balanced/flaky. Not claimed.

### 3. Shared payTo wallet across unrelated "distinct" services · INFO (ecosystem integrity)
| payTo (Base) | Listed as separate services |
|--------------|------------------------------|
| `0x4466d4A84b7c49a6A094ec6eef4a0712D6dd125e` | **api.x402node.dev** (podcast/crypto, EN) + **api.cn402.com** (Chinese almanac 黄道吉日) |
| `0x6d6E695b09861467c7d462f5AAF31cF3540B9192` | Exa + api.exa.ai (same company — expected) |

The x402node/cn402 pair are topically unrelated yet settle to one wallet → a single
operator runs multiple catalog listings. Implication: agentic.market's "unique vendor"
counts are inflated; payer-concentration metrics should be read per-wallet, not per-listing.
Not a vulnerability, but material for anyone trusting the marketplace's diversity stats.

### 4. HTTP 200 returned for an error condition — flipr-x402.fly.dev · LOW (spec smell)
A request with an invalid payment + missing `x-agent-id` returns **HTTP 200** with an
error body (`"state":"missing_x_agent_id"`, *"NO USDC was charged"*). No content is
served and no bypass occurs, but a naive agent keying on the 200 status (not the body)
will mis-handle it. Errors should use 4xx.

---

## VERIFIED FALSE POSITIVES (documented for rigor)

| Flag | Service | Why it was wrong |
|------|---------|------------------|
| 🚨 auth bypass (200 on fake payment) | flipr-x402.fly.dev | The 200 body is an *error envelope*, not paid content. See finding #4. |
| 🚨 secret leak (private key) | api.anchor-x402.com | Scanner's bare `[0-9a-fA-F]{64}` regex matched a public 32-byte content hash in the 402 body. Regex removed. |
| ⚠️ method confusion (GET 200 vs POST 402) | molty.cash, x402-deployer, wallet-portfolio-history-mcp | GET serves the public service **manifest / A2A agent card**, which is the x402 discovery convention — not the paid resource. Detector now skips manifest/`{name,description}` shapes. |

**Lesson:** every automated CRITICAL/HIGH on a paid endpoint must be confirmed with a
manual request before it goes in a GitHub issue. The scan is a funnel, not a verdict.

---

## Scanner Reliability Notes (for next runs)
- Drop or sandbox **method-confusion** as HIGH — serving a GET manifest is near-universal
  for x402 agents; treat it as "manual review", not a finding.
- Secret scan keeps only high-confidence formats (Solana keypair array, `sk-…`, `AKIA…`,
  JWT, `*_live_…`, RFC1918 IPs). The 64-hex heuristic was removed.
- `crash-on-malformed (5xx)` and `CORS+credentials` are the two checks that produced
  **reproducible** real findings — prioritize widening those across P3.

---

## GitHub Issues to File
- [ ] flamewire.io: CORS reflects origin + credentials on `gateway-dev` (HIGH)
- [ ] onesource / suverse / x402stock / agentwonderland: 5xx on malformed X-PAYMENT (MEDIUM)
- [ ] stable* operator (one repo): shared template 500s on malformed X-PAYMENT (MEDIUM)
- [ ] flipr-x402: return 4xx (not 200) for error conditions (LOW)
