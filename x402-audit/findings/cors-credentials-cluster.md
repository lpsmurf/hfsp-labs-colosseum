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

## P4 additions (manual repro, 2026-06-06)

Same misconfiguration found in the P4 sweep (428 services). Reflected-origin +
`credentials: true` confirmed by hand on:

| Service | ACAO returned | Exploitable? |
|---------|---------------|--------------|
| skim402.com | reflected | **Yes** (verified) |
| masterclaw.dev | reflected | **Yes** (verified) |
| token-api.x402hub.xyz | reflected | **Yes** (verified) |
| gifu-server.onrender.com | reflected | Yes |
| kari.mayim-mayim.com | reflected | Yes |
| econdash.org | reflected | Yes |
| api.metalend.tech | reflected | Yes |
| x402.agoragentic.com | reflected | Yes |
| places-api.x402hub.xyz | `*` | Limited (browsers block `*`+creds) |

> Spot-verified skim402 / masterclaw / token-api.x402hub by hand (all three echo
> `Access-Control-Allow-Origin: https://evil.example` + `…-Credentials: true`).
> Brings the ecosystem-wide reflected-origin CORS count to **~16 services** — strong
> evidence of a shared x402 middleware default rather than per-app mistakes.

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

## Disclosure Log

| Date | Service | Channel | Status |
|------|---------|---------|--------|
| 2026-06-07 | Zapper (`public.zapper.xyz`) | GitHub | [Zapper-fi/Zapper-API-Stack#1](https://github.com/Zapper-fi/Zapper-API-Stack/issues/1) ✅ |
| 2026-06-07 | JustaName (`api.justaname.id`) | GitHub | [JustaName-id/JustaName-sdk#147](https://github.com/JustaName-id/JustaName-sdk/issues/147) ✅ |
| 2026-06-07 | lnpay (`pay.lnpay.ai`) | GitHub | [lnpay/lnpay-js#20](https://github.com/lnpay/lnpay-js/issues/20) ✅ |
| 2026-06-07 | crinkl (`api.crinkl.xyz`) | X/Twitter DM | Pending send |
| 2026-06-07 | slamai (`api.slamai.dev`) | X/Twitter DM | Pending send |
| 2026-06-07 | flamewire (`gateway-dev.flamewire.io`) | X/Twitter DM | Pending send |
| — | coinbase/x402 (root cause) | GitHub | Deferred — fix shared middleware default |
