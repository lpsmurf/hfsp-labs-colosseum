# Service tiers — staging the audit product for upsell

The deferred external engines (Slither, Semgrep, Aderyn, Echidna, Halmos) are not
just "more rules." Each needs something the current scan does not have — a
compiler, a build harness, real compute, or a human — and that difference is
exactly what makes them tiers rather than features.

## The ethical line, first

**Tier on depth of analysis, never on withholding findings.**

If a T1 scan finds a critical, it goes in the T1 report. Full stop. Holding a
known critical behind a paywall on a live contract is how you get someone
drained and deserve it.

What you legitimately sell at a higher tier:
- Analysis the lower tier **did not perform** (compiled, cross-file, fuzzed).
- **Confirmation** of a lower-confidence finding.
- **Coverage** of languages or files the lower tier skipped.
- A **human**, and a signed report.

The distinction is real and it is defensible in a sales conversation: we are not
hiding the answer, we ran a cheaper test that cannot reach it.

---

## The tiers

### T0 — Free teaser (lead generation)

**What runs:** current static engines, findings **counted by severity only** — no
titles, no locations.

**Output:** "3 HIGH, 1 CRITICAL across 14 Solidity files. 2 findings need manual
confirmation." Plus the coverage map.

**Why it works:** the counts are honest and genuinely useful, and they create the
question the paid tier answers. No withheld critical, because nobody is acting on
a count — they cannot fix what they cannot locate, so this is a preview, not a
paywall on a fix.

**Cost to us:** ~$0. Reuses `audit-lite`.

---

### T1 — Instant scan *(exists today — $0.99 USDC)*

**What runs:** everything currently built. All static engines (JS/TS, Solidity,
Solana/Anchor, verification-cache, supply-chain), dynamic probes, OSV advisory
lookup, patch-age scoring, AI summary.

**Output:** full findings with severity, **confidence**, SWC/CWE refs, fix text,
coverage map.

**Turnaround:** ~30 seconds, fully self-serve, no human.

**The upsell hooks are already in the data:**
- `summary.needsReview` — every finding below HIGH confidence is a named
  candidate for T2 confirmation.
- `meta.coverage` — `{"clarity": 14}` with zero Clarity findings is a visible,
  honest gap that only T3/T4 closes.
- `VCACHE-001` firing says explicitly that the differential test at T3 is what
  would prove it.

This is the important structural point: **T1 tells the customer what it could not
determine.** That is both better security practice and a better funnel than
pretending the scan was complete.

---

### T2 — Deep scan *(next to build — highest ROI)*

**What runs additionally:**

| Engine | Adds | Needs |
|---|---|---|
| **Aderyn** | Real Solidity AST, cross-file, inheritance-aware | Rust binary, project compiles |
| **Slither** | ~90 detectors, taint analysis, call graph | correct `solc` per project |
| **Semgrep** + Decurity rules | Curated Solidity/Rust security rules | semgrep binary, ~2 GB RAM |
| **`cargo audit` / `npm audit`** | Lockfile-exact transitive advisories | lockfile ingestion |

**What this fixes that T1 structurally cannot:** every false positive documented
in [auditor-toolkit.md](auditor-toolkit.md) came from file-local regex being
unable to resolve inheritance or follow a value across files. T2 is where
`SOL-SIG-002` can actually tell whether an EIP-712 domain comes from a parent
contract, instead of us narrowing the rule to avoid guessing.

**Turnaround:** 2–10 minutes (compilation dominates). Async — job id, poll or
webhook.

**Blocked on:** a stronger VPS (already the recorded reason Semgrep was deferred)
plus lockfile ingestion, which we skip today and which is the stated caveat on
every `DEP-001` finding.

**Indicative price:** $25–75. Justified by compute, not by withheld findings.

---

### T3 — Differential and fuzz harness

**What runs:**

- **Cache differential test** — the corpus with caching on vs. off; any object
  accepted only with the cache is critical. This is the *proof* that
  `VCACHE-001` can only suspect (see
  [verification-cache.md](verification-cache.md)).
- **Echidna / Medusa** property fuzzing against invariants.
- **Halmos** symbolic execution on selected functions.
- **ERC-4626 property tests** (a16z) where a vault is detected.

**Why it cannot be automated into T2:** these need the project to *build and run*,
plus invariants someone has written down. Invariant authoring is the actual
deliverable and it is human work.

**Turnaround:** hours to days. Per-project integration.

**Indicative price:** $500–3,000, scoped per engagement.

---

### T4 — Human review and signed report

**What runs:** T1–T3 plus manual review, with findings written up in the standard
audit-report structure — scope, executive summary, severity rationale, per-finding
evidence, remediation, disclaimers, automated-tool appendix. The
[eosdac/EOS-Contract-Security-Audit](https://github.com/eosdac/EOS-Contract-Security-Audit)
template is a reasonable skeleton for this (it is a report template, not tooling).

**What the customer is actually buying:** a named human taking a position, and a
document they can publish or hand to an investor. That is a different product
from a scan and should be priced as one.

**Indicative price:** $5k–50k depending on scope.

---

### T5 — Continuous monitoring

Module 3. See [../pipeline/module-3-bridge-monitor.md](../pipeline/module-3-bridge-monitor.md)
— the recommendation there is **not to build this as a product**, and to build the
public reconciliation dashboard instead. Listed here only to close the ladder.

---

## Summary

| Tier | Runs | Time | Human | Price |
|---|---|---|---|---|
| T0 | Counts only | 30s | no | free |
| T1 | All built engines | 30s | no | $0.99 |
| T2 | + Aderyn/Slither/Semgrep, lockfiles | 2–10m | no | $25–75 |
| T3 | + differential, fuzzing, symbolic | hours–days | some | $500–3k |
| T4 | + manual review, signed report | days–weeks | yes | $5k–50k |
| T5 | Continuous monitoring | ongoing | on-call | — (don't) |

## Sequencing

1. **T0** — trivial, reuses `audit-lite`, immediate funnel value.
2. **T2** — the real unlock. Needs the VPS and lockfile ingestion. Aderyn first:
   Rust, fast, no per-project `solc` juggling, closest to drop-in.
3. **T3** — only once T2 is identifying candidate targets worth fuzzing. The
   cache differential test is the most defensible single offering here.
4. **T4** — gated on having findings worth a signature, which means gated on the
   recall number from `frontier-evals`. Do not sell a human-backed report while
   recall is unmeasured.

## The measurement that prices all of this

Everything above assumes we know how good T1 is. We do not — precision is
measured, recall is not. Run the engines against
[`frontier-evals`](https://github.com/openai/frontier-evals) before setting any
price or making any claim about what a tier catches. If T1 recall is 5%, then T2
is not an upsell, it is the actual product and T1 is the teaser.
