# pay-skills registry audit — solana-foundation/pay-skills

**Audit date:** 2026-09-07 (report) · public disclosure actions 2026-09-08
**Target:** [solana-foundation/pay-skills](https://github.com/solana-foundation/pay-skills) @ `3a53b5c6bb2aa3877017aefe7e621c006c2a0089` (current `main` tip)
**Auditor:** HFSP Labs (independent) · info@hfsp.xyz
**Result:** 8 findings — 1 High, 4 Medium, 3 Low. All independently reproduced.

> **Embargo note:** one High-severity finding (workflow injection) is under
> coordinated disclosure and is **not** detailed in this public file. Its full
> write-up, reproduction, and the disclosure draft live in the private
> `.superstack/security-reports/` tree (git-ignored) until the maintainer has
> patched. This file will be updated with the reference once it is public.

---

## What pay-skills is

A curated catalog of paid ("x402") APIs for AI agents. Contributors submit a
`PAY.md` + `openapi.json` per provider; a GitHub Actions pipeline live-probes
each one, builds an index, and publishes it to a public GCS bucket
(`gs://pay-skills/v1/`) that agents read to choose which paid API to call. The
security surface is catalog integrity and the publishing pipeline — not funds
held in the repo.

---

## Findings

| ID | Sev | Finding | Status | Public ref |
|----|-----|---------|--------|-----------|
| PAY-01 | **High** | Contributor-controlled provider path reaches a shell context on the authenticated publishing runner (requires merge to `main`) | 🔒 Embargoed — private advisory in prep | — (held) |
| PAY-02 | Medium | Deletion-only commits never publish; normal sync retains old detail files | 📢 Reported | [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-03 | Medium | Multi-commit pushes rebuild only the final commit's providers; a trailing docs-only commit skips the whole publish | 📢 Reported | [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-04 | Medium | Concurrent publishers race; no `concurrency:` guard; can roll back the catalog or undo an emergency removal | 📢 Reported | [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-05 | Medium | Emergency circuit-breaker exclusions aren't durable; a transient GCS fetch failure silently restores an excluded provider | 📢 Reported | [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-06 | Low | Circuit-breaker's own assertion checks the wrong filename + JSON spacing; passes on total exclusion failure | 📢 Reported | [#253](https://github.com/solana-foundation/pay-skills/issues/253) |
| PAY-07 | Low | AgentMail OpenAPI: 21 unresolvable `$ref`s + 68 duplicate operationIds | 📢 Reported | [#254](https://github.com/solana-foundation/pay-skills/issues/254) |
| PAY-08 | Low | README recommends `openapi.url`, which CONTRIBUTING + CI reject | 📢 Reported | [#254](https://github.com/solana-foundation/pay-skills/issues/254) |

**Legend:** 🔒 embargoed · 📢 publicly reported · ✅ fixed · ⬜ open

---

## Verification

Every finding was reproduced independently, not taken from the source report:

- Cloned the repo fresh; confirmed `3a53b5c` is still the `main` tip (nothing fixed upstream).
- PAY-01: reproduced end-to-end in a disposable git fixture with Docker stubbed (harmless marker file; no network, no credentials).
- PAY-02/03: ran the actual detection step against deletion-only, two-commit, and trailing-docs-commit fixtures.
- PAY-04: confirmed no `concurrency:` in any of the 3 workflows; documented the 60s/300s cache-control skew.
- PAY-05: traced the `continue-on-error: true` prev-dist fetch → full-rebuild fallback path.
- PAY-06: ran the real assertion against a dist where exclusion had totally failed → exit 0.
- PAY-07: parsed all 73 committed OpenAPI docs; AgentMail is the only inconsistent one.
- PAY-08: diffed README vs CONTRIBUTING vs the `--strict`-absent workflows; confirmed 0 providers currently use `url:`.

Beyond the original report, this pass added: the PAY-03 trailing-docs-commit case, the PAY-05 network-blip trigger, the cache-control skew, the missing `CODEOWNERS`, and the AgentMail "two stacked bugs" (missing defs *and* bad pointer syntax).

---

## Disclosure timeline

| Date | Action |
|------|--------|
| 2026-09-07 | Audit performed; 8 findings, all reproduced |
| 2026-09-08 | Confirmed `3a53b5c` still `main` tip; nothing fixed upstream |
| 2026-09-08 | Filed public issues [#253](https://github.com/solana-foundation/pay-skills/issues/253) (pipeline) + [#254](https://github.com/solana-foundation/pay-skills/issues/254) (catalog) — neither discloses PAY-01 |
| 2026-09-08 | Discovered repo's `/security/advisories/new` returns 404 — private vuln reporting not enabled despite `SECURITY.md` directing there |
| 2026-09-08 | Prepared direct email to the organization security contact requesting a private channel — detail-free, per org convention |
| — | PAY-01 full report sent (pending private channel) |
| — | PAY-01 patched |
| — | Architecture write-up (Bazaar alignment) published (held until PAY-01 patched) |

---

## Architecture note (separate deliverable)

A companion analysis compares pay-skills against the x402 v2 `bazaar` discovery
extension ([x402-foundation/x402](https://github.com/x402-foundation/x402)) and
argues pay-skills reimplements — with defects — validation the spec already
mandates. It also surfaces that pay-skills *began* as a Bazaar federation
(`bazaars.json`, removed 8 days into the project). Held privately until PAY-01
is patched because it references the injection sink. See private tree.

---

## Private artifacts (not in this public repo)

Under `.superstack/security-reports/` (git-ignored):

- `pay-skills-2026-09-07.md` / `.html` — full 8-finding report + evidence
- `pay-skills-2026-09-08-advisory-PAY-01.md` — private advisory (with donation line + internal notes)
- `advisory-SUBMIT-description.md` — clean advisory body ready to paste
- `advisory-SUBMIT-email-first-contact.md` — maintainer email (channel is 404)
- `pay-skills-2026-09-08-pipeline-issue.md` / `-catalog-issue.md` — issue sources for #253/#254
- `pay-skills-2026-09-08-bazaar-alignment.md` — architecture write-up (embargoed)
- `pay-skills-2026-09-07-evidence/` — scan + reproduction scripts
