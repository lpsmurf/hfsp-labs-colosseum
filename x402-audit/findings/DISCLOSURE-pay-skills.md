# Private Disclosure — solana-foundation/pay-skills

**Status:** PARTIALLY DISCLOSED · 2 public issues filed · 1 high-severity finding **under embargo, contact pending**
**Channel:** repo advisory link is **404** (private vulnerability reporting not enabled) → falling back to maintainer email
**Recipient:** `security@solanalabs.com` (organization security contact)
**Embargo:** hold all detail on PAY-01 until patched, or 90 days from first contact, whichever comes first.

> ⚠️ **This file is committed to a PUBLIC repository.** It deliberately contains **no**
> reproduction, payload, or exploitation detail for the embargoed finding.
> The full report, PoC, and remediation live **local-only** in `.superstack/security-reports/`
> (gitignored). Do not copy them here until PAY-01 is patched and the embargo lifts.

---

## Target

| | |
|---|---|
| Repo | [solana-foundation/pay-skills](https://github.com/solana-foundation/pay-skills) |
| Commit | `3a53b5c6bb2aa3877017aefe7e621c006c2a0089` (still `main` tip at time of review) |
| What it is | Curated registry of x402-payable APIs; CI probes providers and publishes a catalog to a public GCS bucket that AI agents read to make autonomous spend decisions |
| Reviewed | 2026-09-07 (initial), 2026-09-08 (independent verification + disclosure) |
| Method | Source review + local reproduction in disposable Git fixtures with Docker stubbed. No live bucket, credential, container, payment, or provider backend touched. |

---

## Findings

| ID | Sev | Summary | Status |
|---|---|---|---|
| PAY-01 | **High** | CI trust-boundary defect in the publishing workflow. Detail withheld pending disclosure. | 🔒 **EMBARGOED** — contact pending |
| PAY-02 | Medium | Deletion-only commits never publish; removed providers stay listed, and stale detail objects persist in the bucket | ✅ public [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-03 | Medium | `HEAD~1...HEAD` diff drops all but the final commit of a multi-commit push; a trailing docs-only commit skips publication entirely | ✅ public [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-04 | Medium | No `concurrency:` in any workflow — a routine build can overwrite an emergency removal. Plus 60s/300s cache-control skew. | ✅ public [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-05 | Medium | Circuit-breaker exclusions are not persisted; `continue-on-error: true` on the prev-dist fetch means a transient network failure silently restores an excluded provider | ✅ public [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-06 | Low | The breaker's own assertion checks the wrong filename and depends on JSON spacing — returns exit 0 on total exclusion failure | ✅ public [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-07 | Low | AgentMail OpenAPI: 21 unresolvable `$ref`s (missing definitions **and** unescaped `/` in the pointer) + 68 duplicate `operationId` occurrences | ✅ public [#254](https://github.com/solana-foundation/pay-skills/issues/254) |
| PAY-08 | Low | README recommends `openapi.url`, which CONTRIBUTING + CI reject | ✅ public [#254](https://github.com/solana-foundation/pay-skills/issues/254) |
