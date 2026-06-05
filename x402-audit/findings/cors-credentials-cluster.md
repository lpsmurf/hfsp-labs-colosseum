# Audit Finding: CORS reflects attacker origin WITH credentials — systemic cluster

**Date:** 2026-06-05
**Auditor:** HFSP Labs
**Severity:** HIGH (where origin is reflected) / MEDIUM (where `*`)
**Type:** cors-misconfiguration
**Affects:** 10+ services across P2/P3 — likely a shared x402 middleware default

---

## Summary

A request carrying `Origin: https://evil.example` is answered with
`Access-Control-Allow-Origin: <that origin>` **and**
`Access-Control-Allow-Credentials: true`. A malicious web page can then make
credentialed cross-origin calls and read the responses. The volume of identical
configs suggests a common x402 middleware/template ships these headers by default.

---

## Confirmed (manual repro, 2026-06-05)

| Service | ACAO returned | Exploitable? |
|---------|---------------|--------------|
| public.zapper.xyz | `https://evil.example` (reflected) | **Yes** — reflected origin + credentials |
| api.justaname.id | `https://evil.example` (reflected) | **Yes** — reflected origin + credentials |
| gateway-dev.flamewire.io | `https://evil.example` (reflected) | **Yes** (dev subdomain) |
| agents.allium.so | `*` | Limited — browsers block `*` + credentials |
| api.slamai.dev / slamlink…zuplo.dev | reflected | Yes |
| pay.lnpay.ai | reflected | Yes |
| api.crinkl.xyz | reflected | Yes |
| meryol-agenticmarket-x402.hf.space | reflected | Yes |
| api-dev.agents.skillfulai.io | `*` | Limited |

> **Nuance worth keeping us honest:** `ACAO: *` with `credentials: true` is *rejected*
> by browsers, so Allium/skillfulai are lower-risk than the reflected-origin ones.
> The reflected-origin set (Zapper, justaname, lnpay, crinkl, slamai…) is the real concern.

---

## Reproduce

```bash
curl -s -D - -o /dev/null -X POST \
  -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{}' \
  https://public.zapper.xyz/x402/account-identity | grep -i access-control
# access-control-allow-origin: https://evil.example
# access-control-allow-credentials: true
```

---

## Recommended Fix

- Never combine a reflected/`*` `Access-Control-Allow-Origin` with
  `Access-Control-Allow-Credentials: true`.
- Pin an explicit allowlist of trusted origins, or drop credentials entirely for
  public pay-per-call endpoints (x402 auth is the `X-PAYMENT` header, not a cookie —
  credentials usually aren't needed at all).

---

## GitHub Issues to File
- [ ] zapper, justaname, lnpay, crinkl, slamai: reflected-origin CORS + credentials (HIGH)
- [ ] Trace the shared x402 middleware/template setting these defaults (root-cause fix)
