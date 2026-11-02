# pay (CLI) audit — solana-foundation/pay

**Audit date:** 2026-09-08 · **Auditor:** HFSP Labs (independent) · info@hfsp.xyz
**Target:** [solana-foundation/pay](https://github.com/solana-foundation/pay) @ `1200945` (`main` tip)
**Result:** 2 findings — both Medium (one escalates on some hosting). Both **under coordinated disclosure**.

> **Embargo note:** full technical detail, reproductions, and fixes live in the private
> `.superstack/security-reports/pay-cli-2026-09-08.md` tree (git-ignored) until the maintainer
> has responded. This public index carries area + severity + status only — no exploit detail.

The Rust CLI / catalog engine behind `ghcr.io/solana-foundation/pay:latest` — the image the
pay-skills CI runs as `pay catalog build|check`. Distinct repo from `pay-kit`.

## Findings

| ID | Sev | Area | Status |
|----|-----|------|--------|
| PAY-CLI-01 | Medium | Privileged CI workflow (`workflow_run`) trust boundary — supply-chain exposure. Detail withheld pending disclosure. | 🔒 Embargoed — private report pending |
| PAY-CLI-02 | Medium (higher on some infra) | Server-side request forgery (SSRF) in the provider-probing path. Detail withheld pending disclosure. | 🔒 Embargoed — private report pending |

**Legend:** 🔒 embargoed · 📢 publicly reported · ✅ fixed · ⬜ open

## Verified sound (not findings)
Payment-middleware settlement (debits on success, refunds on failure), server signer key
handling (rejects mismatched pubkey), and the committed-spec `openapi.url` rejection were all
reviewed and looked correct. Secrets scan: only public test signatures in-tree.

## Limits
Source review + fetch-path trace of the catalog/payment/CI surface. No Rust build/test run,
no live probe, no credential or infra access. The full 251-file Rust surface beyond
payment/catalog/CI was not exhaustively audited.
