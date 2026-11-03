# Coverage vs shieldfy/API-Security-Checklist

How x402-audit-api's automated checks map to the [shieldfy API Security Checklist](https://github.com/shieldfy/API-Security-Checklist).
✅ = automated probe · 🟡 = partial / heuristic · 📄 = manual/methodology (see `multihopper-flow-audit/TOOLING.md`) · ➖ = design-time / not black-box testable.

## Authentication
| Item | Status | Where |
|---|---|---|
| Don't use Basic Auth / use standards | 🟡 | `auth-bypass` (accepts Bearer/api-key; Basic → 401 observed manually) |
| Don't reinvent auth/token/password storage | ➖ | design |
| Max Retry / jail on login | 📄 | rate-limit (manual) |
| Encrypt sensitive data | ➖ | design |

## Access
| Item | Status | Where |
|---|---|---|
| Throttling / rate limiting | 📄 | manual burst test (avoided in the automated tool to not abuse third-party endpoints) |
| HTTPS TLS1.2+ | ✅ | `assertSafeEndpoint` refuses non-HTTPS |
| HSTS header | ✅ | `headers` (DYN-HDR-001) |
| Turn off directory listings | 📄 | manual |
| Safelist IPs for private APIs | ➖ | deployment |

## Authorization (OAuth) — ➖ mostly N/A for API-key/x402 services (no OAuth flow)

## Input
| Item | Status | Where |
|---|---|---|
| Proper HTTP method / 405 | ✅ | `http-methods` (DYN-METHOD-001/002) |
| Validate request content-type / 415/406 | ✅ | `http-methods` (DYN-METHOD-003) |
| Validate input (XSS/SQLi/RCE) | ✅ | `schema-leak` (SQLi/overflow/type-confusion/proto-pollution → DYN-LEAK-001/002) |
| No sensitive data in URL | 🟡 | `static/secrets` (repo scan) |
| API gateway / caching | ➖ | infra |

## Processing
| Item | Status | Where |
|---|---|---|
| All endpoints behind auth | 🟡 | `auth-bypass` (payment/auth gate) |
| Avoid user resource IDs / use /me | 📄 | IDOR/BOLA (manual — needs resource IDs) |
| **Don't auto-increment IDs, use UUID** | 📄 | manual — flagged in MultiHopper (sequential integer transfer IDs → enumeration/BOLA surface) |
| XXE / entity expansion | 🟡 | `schema-leak` sends malformed/nested bodies; XML-specific XXE is 📄 |
| DEBUG mode off | ✅ | `info-leak` + `schema-leak` (stack traces / DB errors in responses) |

## Output
| Item | Status | Where |
|---|---|---|
| X-Content-Type-Options: nosniff | ✅ | `headers` (DYN-HDR-001) |
| X-Frame-Options: deny | ✅ | `headers` (DYN-HDR-001) |
| Content-Security-Policy | ✅ | `headers` (DYN-HDR-001) |
| Remove fingerprinting headers | ✅ | `headers` (DYN-HDR-002 — Server/X-Powered-By/X-AspNet-Version) |
| Force content-type on response | 🟡 | observed via `http-methods` |
| No overly-specific error messages | ✅ | `info-leak` + `schema-leak` (DB query/schema leak) |
| No sensitive data (creds/tokens) | ✅ | `info-leak` (DYN-INFO-002) |
| Proper status codes | 🟡 | `http-methods` (405/415) |

## CI & CD / Monitoring — ➖ process/deploy-time (out of black-box scope), except:
| Item | Status | Where |
|---|---|---|
| Static scan / secrets in VCS | ✅ | `static/secrets` (repo clone + scan) |
| Dependency vuln scan | 📄 | out of scope (add `npm audit` step if desired) |

## Beyond the checklist (added from the MultiHopper agentic-flow audit)
| Check | Where |
|---|---|
| DB query/schema leak on crafted input (numeric overflow 2^63, type confusion, proto pollution) | ✅ `schema-leak` |
| Solana program upgradeable by a single plain keypair (centralization / rug risk) | ✅ `checkProgramUpgradeAuthority` (CHAIN-UPGRADE-001) |
| Idempotency-Key TOCTOU / duplicate-request races, webhook SSRF+HMAC, fee-tier evasion, quote-stale, resume/double-fund | 📄 bespoke harness — needs per-target endpoint knowledge (see `multihopper-flow-audit/`) |
