# Rule-derivation protocol

We are deriving new rules by reading real audit findings. That is legitimate —
it is how any auditor learns — but it destroys the benchmark if done carelessly:
rules written against findings we have read measure memorisation, not detection.

## The split

`corpus-split.json` fixes a deterministic 2-way split of the 41 evmbench audits
by `sha256(audit_name) % 2`. Nothing to fiddle, reproducible from the names alone.

| Half | Audits | Gold vulns | Rule |
|---|---|---|---|
| `derive` | 24 | 78 | May be read freely. Rules may be written from them. |
| `holdout` | 17 | 40 | **Never read.** Measurement only. |

**The held-out audits are:** 2023-12-ethereumcreditguild, 2024-01-canto,
2024-03-coinbase, 2024-03-gitcoin, 2024-05-arbitrum-foundation, 2024-05-olas,
2024-07-benddao, 2024-07-munchables, 2024-07-traitforge, 2024-08-phi,
2025-01-liquid-ron, 2025-01-next-generation, 2025-02-thorwallet,
2025-04-virtuals, 2025-05-blackhole, 2025-10-sequence, 2026-01-tempo-mpp-streams.

Two of these have already been partly exposed in analysis output during this
work (ethereumcreditguild H-01/H-02 bodies were read; 2024-08-phi titles were
seen). They stay in the holdout half but any result involving them should be
discounted, and it is recorded here rather than quietly forgotten.

## Rules

1. A new rule may cite a `derive`-half finding as its origin. Record which.
2. Report both numbers, always: derive-half recall **and** holdout recall. A rule
   that lifts the first and not the second is memorisation and should be reverted.
3. The baseline to beat is the pattern engines' ~2-4% true recall over 103
   scorable vulnerabilities (see `prep-kits/x402-audit-tiers/TEST-PLAN.md` §3).
4. Precision gates still bind. A rule that adds recall while pushing the
   OpenZeppelin ceiling over 30 findings, or firing CRITICAL/HIGH on the four
   audited protocols, is not a win.

## Mechanism classes in the derive half

Ranked by share of the 78 derive-half gold findings, by title keyword — a rough
signal, not a classifier:

```
 17 (21%)  accounting / share / index calculated wrong
  5 ( 6%)  DoS / griefing / stuck funds
  4 ( 5%)  missing or broken access control
  4 ( 5%)  price / oracle manipulation
  2 ( 2%)  reentrancy
  1 ( 1%)  signature replay
```

The largest class is also the least patternable. The tractable targets are
access control (a missing guard is structurally visible) and stuck funds (value
taken but never forwarded).

## Log

| Date | Audit | Blind? | Gold found | Rules derived |
|---|---|---|---|---|
| 2026-09-12 | 2024-01-curves (derive) | yes | 1/4 (H-04, CRITICAL) | pending: missing-guard inventory, unchecked arithmetic |

See `ai-detect-n1-curves.md` for that trial in full.
