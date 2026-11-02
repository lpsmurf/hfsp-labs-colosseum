# pay-kit audit — solana-foundation/pay-kit

**Audit date:** 2026-09-08 (verification of a prior report) · **Auditor:** HFSP Labs (independent) · info@hfsp.xyz
**Target:** [solana-foundation/pay-kit](https://github.com/solana-foundation/pay-kit) @ `c143bfab` (`main` tip)
**Result:** 4 findings independently re-derived + confirmed (2 High, 2 Medium) + 1 new (Info). All **under coordinated disclosure**.

> **Embargo note:** full technical detail, reproductions, and fixes live in the private
> `.superstack/security-reports/pay-kit-2026-09-08.md` + `-verification.md` tree (git-ignored)
> until the maintainer has responded. This public index carries area + severity + status only.

The multi-language SDK (TS / Rust / Lua) websites use to demand and verify x402/MPP payment.

## Findings

| ID | Sev | Area | Status |
|----|-----|------|--------|
| KIT-01 | High | Subscription-activation signing scope (server-sponsored mode). Detail withheld. | 🔒 Embargoed |
| KIT-02 | High | Payment-verification replay in the transaction/pull path — same TOCTOU class already credited to an external reporter in push mode; not covered by that fix. Detail withheld. | 🔒 Embargoed |
| KIT-03 | Medium | Settlement reported before on-chain confirmation (Lua path). Detail withheld. | 🔒 Embargoed |
| KIT-04 | Medium | Account-decoder schema divergence — fails closed (availability/correctness, not theft). | 🔒 Embargoed |
| KIT-05 | Info | Developer local filesystem paths committed in 3 files (hygiene). | 🔒 Held with the set |

**Legend:** 🔒 embargoed · 📢 publicly reported · ✅ fixed · ⬜ open

## Verification note
This was a re-derivation of a prior report against live code (still `main` tip; nothing fixed).
All four prior findings **confirmed**; the report was, if anything, conservative (the KIT-01
impact and the KIT-02 second instance were understated). No finding was overturned.

## Limits
Source-level re-derivation. TS/Python suites were run by the original report; no on-chain
transaction, live RPC, or deployed-program layout fetch in this pass.
