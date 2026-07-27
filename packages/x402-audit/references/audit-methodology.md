# x402 Audit Methodology & Tooling

Consolidated checklist + tool inventory for both the manual ecosystem sweeps
(`x402-audit/scripts/*`) and the paid audit service (`packages/x402-audit-api`).

Synthesised from:
- **gitleaks** — secret scanning (https://github.com/gitleaks/gitleaks)
- **bearer** — SAST + sensitive-data-flow (https://github.com/bearer/bearer)
- **Trail of Bits skills** — audit workflow + semgrep/static-analysis (https://github.com/trailofbits/skills)
- **ECC security-review + production-audit** skills (https://github.com/affaan-m/ECC)

---

## 1. Engines (what runs, and where)

| Engine | Source of inspiration | Where it lives | Needs a binary? |
|---|---|---|---|
| Provider secret rules + Shannon entropy | gitleaks | `static/secrets.ts` | no |
| OWASP/CWE SAST heuristics | bearer, ECC security-review | `static/sast.ts` | no |
| x402 settlement deep checks | ECC production-audit | `static/x402-checks.ts` | no |
| CORS / payment-bypass | original | `static/cors.ts`, `static/payment.ts` | no |
| gitleaks (full ruleset) | gitleaks | `engines/external.ts` | `gitleaks` |
| semgrep (`--config auto`) | Trail of Bits static-analysis | `engines/external.ts` | `semgrep` |
| Live probes (auth bypass, CORS, info-leak) | original | `dynamic/*` | no |

The external engines auto-run only when the binary is on PATH, so the service
degrades gracefully. To unlock the full secret + semgrep ruleset on the host:

```bash
# macOS
brew install gitleaks semgrep
# linux
curl -sSfL https://raw.githubusercontent.com/gitleaks/gitleaks/master/scripts/install.sh | sh
pipx install semgrep
```

---

## 2. Static checklist (per repo)

### Secrets (gitleaks lens)
- [ ] No cloud keys (AWS `AKIA…`, GCP `AIza…`/service-account JSON, Azure)
- [ ] No source-host tokens (GitHub `ghp_/github_pat_`, GitLab `glpat-`, npm `npm_`)
- [ ] No payment/AI keys (Stripe `sk_live_`, OpenAI `sk-`, Anthropic `sk-ant-`)
- [ ] No wallet material (PEM blocks, Solana base58 87–88, EVM `0x…64`, BIP-39 mnemonic)
- [ ] No high-entropy generic `key/secret/token = "…"` assignments
- [ ] Secrets absent from git history (run `gitleaks git`), not just the tip

### SAST (bearer / ECC lens)
- [ ] No SQL built by string interpolation — parameterized queries only (CWE-89)
- [ ] No `child_process` exec with interpolation — use arg arrays (CWE-78)
- [ ] Outbound requests to user-controlled URLs are allowlisted (SSRF, CWE-918)
- [ ] No MD5/SHA-1 for security; no `Math.random()` for tokens (CWE-327/338)
- [ ] No `eval`/`new Function` on input (CWE-95)
- [ ] Filesystem paths from input are confined to a base dir (CWE-22)
- [ ] Auth tokens not in `localStorage` (CWE-922)
- [ ] TLS verification not disabled (`rejectUnauthorized:false`) (CWE-295)
- [ ] JWT verified (not `decode`), never `alg:none` (CWE-347)
- [ ] Redirect targets are allowlisted (open redirect, CWE-601)

### Input handling (ECC security-review)
- [ ] All request input validated with a schema (zod/joi), whitelist not blacklist
- [ ] File uploads bounded by size, MIME type, and extension
- [ ] Error messages don't leak stack traces, secrets, or internal topology
- [ ] Authorization enforced server-side on every sensitive route

---

## 3. x402 / payment deep checks (production-audit lens)

- [ ] **Verify before parse** — webhook/payment signature is computed over the
      *raw* bytes before `JSON.parse`, with `crypto.timingSafeEqual`.
- [ ] **Replay/idempotency** — each settled tx signature / payment id is recorded
      and duplicates are rejected atomically (claim-before-verify).
- [ ] **Amount validation** — settled amount ≥ required price, in the correct
      asset/mint, before access is granted.
- [ ] **Network/asset validation** — settled network AND token match one of the
      advertised `accepts[]` entries (no cross-chain / worthless-token spoof).
- [ ] **Version pinning** — `x402Version` emitted and validated as a concrete
      value (see `findings/x402-v1-v2-spec-divergence.md`).
- [ ] **No presence-only gating** — never serve paid content on the mere presence
      of an `X-PAYMENT` header (see `findings/CRITICAL-base-intel-api-auth-bypass.md`).

---

## 4. Dynamic probes (live endpoint)

- [ ] Unpaid request returns a spec-compliant 402 with `accepts[]` (not 200/500)
- [ ] Auth bypass: forged/empty `X-PAYMENT` does not unlock content
- [ ] CORS: no `Access-Control-Allow-Origin: *` combined with credentials
- [ ] Info leak: 402/error bodies don't expose stack traces, internal IPs, keys

---

## 5. Production-readiness scoring (production-audit lens)

Score forces prioritisation, not certainty.

| Band | Score | Meaning |
|---|---|---|
| Blocked | 0–49 | Do not ship until top risks fixed |
| Risky | 50–69 | Ship only behind a small/internal rollout |
| Launchable w/ caveats | 70–84 | Ship if owners accept listed risks |
| Strong | 85–100 | No obvious blockers from available evidence |

**Cap at 69** if any: missing authz on sensitive data; non-idempotent payment/
webhook handling; secrets in code/logs/bundle; no rollback path.
**Cap at 84** if CI isn't green or the paid path wasn't tested end-to-end.

---

## 6. Anti-patterns (do not do)

- Treating a green 402 response as proof the payment is actually verified.
- Uploading a client's source to a third-party scanner without explicit approval
  (the service materialises files into a throwaway temp dir and deletes them).
- Producing a verdict without naming the evidence checked.
- Reporting secrets in cleartext in the output — reference rule + location only.
