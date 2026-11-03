# x402-audit-api

Pay $0.99 USDC on Base to get an automated security audit of any public x402 GitHub repo.

**Built by [HFSP Labs](https://hfsp.xyz) · [info@hfsp.xyz](mailto:info@hfsp.xyz)**

---

## What It Does

1. Caller pays $0.99 USDC via x402 on Base or Solana
2. Server fetches the target GitHub repo
3. Runs the analysis engines below
4. Runs dynamic probes against live endpoints
5. Returns a structured JSON findings report with severity ratings + AI feedback

## Analysis Engines

| Engine | What it catches | Source of method | Binary? |
|---|---|---|---|
| **Secret scanner** (`static/secrets.ts`) | 25+ provider rules — AWS/GCP/GitHub/GitLab/Stripe/OpenAI/Anthropic/Slack/wallet keys + PEM + BIP-39 mnemonics — with Shannon-entropy filtering | [gitleaks](https://github.com/gitleaks/gitleaks) | no |
| **SAST** (`static/sast.ts`) | OWASP/CWE heuristics: SQLi, command injection, SSRF, weak crypto, insecure randomness, `eval`, path traversal, JWT-in-localStorage, TLS bypass, `alg:none`, open redirect | [bearer](https://github.com/bearer/bearer) · [ECC](https://github.com/affaan-m/ECC) | no |
| **x402 deep checks** (`static/x402-checks.ts`) | webhook parse-before-verify, missing replay/idempotency, amount-not-validated, network/asset confusion, unpinned `x402Version` | ECC production-audit | no |
| **CORS + payment-bypass** (`static/*`) | wildcard CORS w/ credentials, presence-only `X-PAYMENT` gating | original sweeps | no |
| **External engines** (`engines/external.ts`) | full gitleaks ruleset + `semgrep --config auto`, auto-run when installed on the host (graceful no-op otherwise) | gitleaks · [Trail of Bits](https://github.com/trailofbits/skills) | yes |
| **Dynamic probes** (`dynamic/*`) | live auth bypass, CORS, info-leak | original | no |

Methodology + full checklist: [`../../x402-audit/references/audit-methodology.md`](../../x402-audit/references/audit-methodology.md).

To unlock the external engines on the host:

```bash
brew install gitleaks semgrep      # macOS
# or: gitleaks install script + pipx install semgrep
```

## Dynamic probes (`src/dynamic/`)

Live checks against the target endpoint. Several were generalized from the MultiHopper
agentic-flow audit (see `multihopper-flow-audit/`), turning one-off findings into reusable checks:

| Probe | Finding IDs | What it catches |
|-------|-------------|-----------------|
| `auth-bypass` | `DYN-AUTH-001` | Fake `X-PAYMENT` header accepted (payment gate bypass) |
| `cors-probe` | `DYN-CORS-001/002` | Arbitrary-origin reflection with `credentials:true` |
| `info-leak` | `DYN-INFO-001/002` | Stack traces / secrets in error responses |
| **`schema-leak`** | `DYN-LEAK-001/002` | **DB query/schema leaked on crafted input** (numeric overflow 2^63, type confusion, prototype pollution, malformed JSON) — the A13 / auth-table-leak class; plus unhandled 500s on bad input |
| **`headers`** | `DYN-HDR-001` | Missing recommended security headers |
| **`solana-upgrade-authority`** | `CHAIN-UPGRADE-001` | **Solana programs upgradeable by a single plain keypair** (not immutable / not multisig) — the "UPGRADE-AUTH" centralization class. Exported `checkProgramUpgradeAuthority(programIds, cluster)`; feed program IDs extracted from the repo or provided explicitly (read-only RPC) |

All endpoint probes run behind an SSRF guard (`assertSafeEndpoint`) that refuses non-HTTPS and
private/reserved/link-local/metadata targets before any request is made.

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
