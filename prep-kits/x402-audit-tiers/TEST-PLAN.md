# Test plan — x402-audit-tiers

## Principle

Two numbers matter and they are independent:

- **Precision** — of what we flagged, how much was real? *(Are we crying wolf?)*
- **Recall** — of the real bugs present, how many did we catch? *(Are we missing things?)*

A tool that flags nothing has perfect precision and zero recall, and is useless.
**Precision is measured. Recall is not.** Every claim below says which it tests.

## 1. Precision baseline — clean code *(automated, run on every rule change)*

Target: `OpenZeppelin/openzeppelin-contracts`, 248 non-test contracts. Well
audited, so nearly every finding is a false positive or a benign true positive.

Current: **22 findings / 248 files.**

```
13  SOL-PRAGMA-001  [INFO/HIGH]      floating pragma on deployable contracts
 3  SOL-INPUT-001   [MEDIUM/MEDIUM]  zero-address setters
 2  SOL-DELEGATE-001[HIGH/LOW]       delegatecall in proxies (by design)
 1  SOL-4626-001    [INFO/LOW]       ERC4626 checklist prompt
 1  SOL-HASH-001    [MEDIUM/MEDIUM]
 1  SOL-SIG-001     [MEDIUM/MEDIUM]
 1  SOL-RAND-001    [HIGH/MEDIUM]
```

**Gate: any rule change that pushes this above 30 must be justified or reverted.**

History — this was 52 before three real false-positive bugs were fixed:
- `STATIC-SECRET-004` reported 21 CRITICAL "leaked private keys" that were all
  ERC-7201 storage slots. Now suppressed for contract languages.
- `SOL-SIG-002` used `\bnonce`, which cannot match `_useNonce` (no word boundary
  after `_use`), so it fired on the *correct* `ERC20Permit.permit` and all of
  ERC-3009.
- `SOL-PRAGMA-001` fired on every library and interface, which float on purpose.

## 1b. Precision on real, audited protocol code *(the test that matters most)*

A clean-library baseline is not enough: the failure mode that destroys a
scanner's credibility is a CRITICAL on famous, heavily-audited code. Run against
real protocols and require **zero CRITICAL and zero HIGH**.

| Repo | Findings | Notes |
|---|---|---|
| `Uniswap/v2-core` | **0** | |
| `Uniswap/v3-core` | 1 MEDIUM | `UniswapV3Factory.setOwner()` has no zero-address check — genuine |
| `aave/aave-v3-core` | INFO only | |
| `transmissions11/solmate` | 3 MEDIUM + INFO | solmate omits zero-address checks by design — true by rule, intended by author |

**Gate: any CRITICAL or HIGH on these four is a bug in our rules until proven
otherwise.**

This test found four false positives on its first run, three of which a clean
library baseline could never have surfaced:

- `SOL-PROXY-001` reported **CRITICAL/HIGH "unprotected initializer"** on
  `UniswapV2Pair` and `UniswapV3Pool`. Both are guarded —
  `require(msg.sender == factory)` and `require(slot0.sqrtPriceX96 == 0)` — just
  not with OpenZeppelin's `initializer` modifier, which was the only guard the
  rule recognised. Now function-level and accepts modifiers, access-control
  modifiers, `msg.sender` checks, and already-initialized state guards.
- `SOL-CALL-001` reported a discarded return value in Uniswap v3's
  `TransferHelper`, which splits the assignment across two lines so the call
  lands at line-start. The rule was line-anchored; it now walks back to the start
  of the statement to look for an assignment. No longer a table rule.
- `SOL-ORACLE-001` fired on `UniswapV2Pair`/`UniswapV3Pool` themselves, which
  *define* `getReserves`/`slot0`. The rule is about consumers of a spot price,
  not the pool that publishes one. Now requires a member call.
- The fetcher counted **vendored dependencies and fuzzing harnesses**: 9 of 10
  aave findings were against `contracts/dependencies/openzeppelin/`, and three
  Uniswap v3 findings were against Echidna harnesses under
  `audits/tob/contracts/crytic/` — code written to be broken on purpose.
  `dependencies`, `deps`, `third-party`, `crytic`, `echidna`, `audits`,
  `fixtures` and `mocks` are now excluded, alongside the existing `lib/`.

`SOL-PRAGMA-001` was also demoted LOW → INFO: real (SWC-103) but it was 13 of 22
findings on OpenZeppelin and dominated every report.

## 2. Rule firing — vulnerable fixtures *(automated)*

Hand-written fixtures per engine, each paired with a **corrected** version that
must produce zero findings. The paired-clean half is the part that has value;
the vulnerable half only proves the regex executes.

| Fixture | Fires | Corrected version |
|---|---|---|
| `vuln.sol` | 11/11 | `clean.sol` → **0** |
| `vuln.rs` | 8/8 | — |
| `Cargo.toml` (`overflow-checks = false`) | 1/1 | — |
| `cache_vuln.cpp` | 3/3 | — |
| `cache_vuln.rs` | 3/3 | `cache_fixed.rs` → **0** |
| `evil-package.json` | 3/3 | `clean-package.json` → **0** |
| `sink.ts` | 3/3 | — |

**This is not a recall measurement.** The same person wrote the bugs and the
rules that catch them. It tests that rules execute and that fixes silence them.

## 3. Recall — `frontier-evals` *(MEASURED)*

Corpus: 40 Code4rena/Sherlock-style audit contests via
[`evmbench`](https://github.com/paradigmxyz/evmbench) /
[`frontier-evals`](https://github.com/openai/frontier-evals), **118 gold
vulnerabilities** that real auditors were actually paid for. Source cloned from
`evmbench-org` rather than fetched (40 audits x ~131 requests would blow the
hourly GitHub budget). Harness: `scripts/recall-bench.ts`.

File selection goes through the product's own `selectFiles()`, so the bench sees
exactly what a paid audit sees, 120-file cap included. A bug in file 300 of a
large repo is a real miss, not a rule gap.

### Headline

| Measure | Value |
|---|---|
| Files read | 3,633 |
| Findings produced | 669 |
| Scorable gold vulns | 103 of 118 (88% had a file signal) |
| **Reached — any finding in the right file** | 65 / 103 = **63.1%** |
| &nbsp;&nbsp;expected by chance | 23.7% → **2.66x lift** |
| **Reached — CRITICAL/HIGH only** | 37 / 103 = **35.9%** |
| &nbsp;&nbsp;expected by chance | 6.4% → **5.64x lift** |
| **True recall, hand-graded** | **~2-4%** |

Measured after the `lib/` dependency fix. Before it, 22 of the 40 corpus repos
were feeding forge-std and OpenZeppelin into the analysis: 1,068 findings instead
of 669, and reach of 23.3% instead of 35.9% because the file budget was being
spent on dependencies rather than the contracts under audit. **Reach improved
substantially; true recall did not move at all.** Excluding dependencies is worth
doing for noise and for honesty, but it does not make the engines better at
finding bugs.

### A known weakness in the reach metric

Reach is per-gold-vulnerability, and several gold bugs often live in one file, so
a single finding can "reach" many of them. One `SOL-AUTH-001` in
`src/PhiFactory.sol` reaches **six** separate gold bugs in that file — including
one titled "Signature replay in signatureClaim", which has nothing to do with
`tx.origin`. That inflation is why the hand-graded number is the one to quote and
the reach number is only a ceiling.

The chance row is the control and it is essential. With ~27 findings per audit,
landing on the right file by accident is common — half the "any finding" reach is
spray. The CRITICAL/HIGH lift of 6.42x is a real signal, but "right file" is not
"right bug".

### Hand grading — all 24 CRITICAL/HIGH reaches

Two genuine catches:

- `2024-03-taiko H-05` "Signatures can be replayed in withdraw()" ←
  `SOL-SIG-002 @ TimelockTokenPool.sol → withdraw()`. Same file, same function,
  same bug class.
- `2026-01-tempo-feeamm H-01` "Reentrancy in burn allows stablecoin pool
  drainage" ← `SOL-REENTRANCY-001 @ FeeAMM.sol → burn()`. Likewise exact.

Two arguable partials (`2024-04-noya H-06` incomplete TVL calculation ←
`SOL-ORACLE-001`; `2024-01-init-capital H-03` front-run via state change ←
`SOL-REENTRANCY-001`, ordering-adjacent).

The other twenty are right-file-wrong-reason. The pattern is stark: three
different benddao bugs and three different secondswap bugs were each "reached"
by one unrelated finding in a file they happen to share.

### Why the ceiling is low — and this is the important number

Categorising all 118 gold titles by bug shape:

```
 22 (18%)  plausibly matchable by a pattern rule
             8  signature / replay
             4  access control
             4  oracle / spot price
             3  reentrancy
             3  overflow / underflow
 96 (81%)  logic / accounting / protocol design
```

Examples from the 81%: *"userGaugeProfitIndex is not set correctly"*,
*"update_market() market weight incorrect"*, *"Anyone can steal all distributed
rewards"*, *"releaseRate is calculated incorrectly"*. The code does exactly what
it says; what it says is wrong. **No pattern rule reaches these, ever.**

So ~18% is the theoretical ceiling for *any* pure pattern approach on this
corpus, and we are at ~3%. Both numbers matter: the gap between them is what
more rules could win, and the 82% above the ceiling is what they never can.

### Precision on contest code is worse than the library baseline suggested

1,068 findings across 3,633 files is 0.29 per file, against 0.09 on
OpenZeppelin. 74% of output is INFO (`{INFO: 790, HIGH: 148, MEDIUM: 96, LOW: 23,
CRITICAL: 11}`). The OZ ceiling did not predict this because OZ is unusually
clean. **A second precision gate on contest-grade code is worth adding.**

### Reproducing

```bash
git clone https://github.com/openai/frontier-evals            # corpus metadata
for a in $(ls frontier-evals/project/evmbench/audits | grep ^20); do
  git clone --depth 1 https://github.com/evmbench-org/$a.git corpus/$a
done
npx tsx scripts/recall-bench.ts ./frontier-evals ./corpus
```

Caveat: the harness's small YAML reader finds 117 of 118 gold entries — a ~1%
undercount that does not move any conclusion.

## 3b. AI detection — n=1 blind trial *(one data point, not a measurement)*

On `2024-01-curves`, with a chat session standing in for the model through
`AI_DETECT_MODE=file`: **1 of 4 gold findings, the CRITICAL one** — H-04's
missing access control on `FeeSplitter.setCurves`. The pattern engines found
**0 of 4** on the same repo.

That is the hypothesis behind the AI pass working once. It is not a measurement:
n=1, the stand-in model is more capable than anything that runs at $0.99, the
target was unusually small and clean, and one miss (H-05) happened simply because
a file was never read. Full write-up, including the two unverified extra findings
and every caveat, in `x402-audit/experiments/ai-detect-n1-curves.md`.

Next: the same corpus run with a real provider key, compared against the ~2-4%
pattern baseline over the same 103 scorable vulnerabilities.

## 4. Tier behaviour *(automated, verified)*

| Case | Expected | Verified |
|---|---|---|
| `GET /audit/tiers` | all 5 tiers, `available` flags, `blockedOn` on unavailable | ✅ |
| `GET /audit?tier=T2` | **501**, names what is blocked, does not quote a price | ✅ |
| `GET /audit?tier=BOGUS` | **400**, lists valid tiers, no silent downgrade | ✅ |
| `GET /audit?tier=T0` | **400**, redirects to `/audit/preview` | ✅ |
| `GET /audit` (no tier) | **402** at T1 price, `amount` = `990000` (6dp) | ✅ |
| 402 body | `audit.tier`, `notIncluded[4]`, `upgrade[T2,T3,T4]` | ✅ |
| `GET /audit/preview` | counts only, `findings: []`, `preview.redacted: true` | ✅ verified end-to-end, 3.4s on Uniswap/v2-core |
| `POST /audit` tier mismatch | 400 / 501 rather than silent downgrade | ⚠️ needs payment fixture |

**Critical invariant to keep testing: an unavailable tier must never return 402.**
Quoting a price for work that cannot be delivered is fraud, not a roadmap.

## 5. Error differentiation *(verified)*

| Upstream condition | Status | Body |
|---|---|---|
| GitHub 403 + `x-ratelimit-remaining: 0` | **503** | names the limit, reset window, and whether `GITHUB_TOKEN` is set | ✅ |
| GitHub 404 | **404** | "not found, or private and we have no access" | ✅ |
| anything else | 500 | generic | ✅ |

This existed as a single misleading "repo may be private or unreachable" for all
three, which sent us chasing a permissions problem that was actually an empty
`GITHUB_TOKEN`.

## 6. Live integration *(partly verified)*

| Check | Status |
|---|---|
| OSV.dev advisory lookup returns real data with correct severity mapping | ✅ `minimist@1.2.0` → CRITICAL, `lodash@4.17.20` → HIGH, `express@4.19.2` → LOW |
| Clean manifest → 0 advisories | ✅ |
| Non-registry (`git+https`) deps excluded from OSV, flagged separately | ✅ |
| Patch-age scoped to `criticalPaths` only | ⚠️ exercised only where a critical path exists; no stale hit observed yet |
| Dynamic probes against a live x402 endpoint | ⚠️ needs a deployed target |

## Running it

```bash
cd packages/x402-audit-api

npm run typecheck          # must be clean
npm test                   # 55 unit tests, no network, ~0.4s
npm run test:integration   # 7 precision gates, needs GITHUB_TOKEN, ~35s
```

`npm test` from the repo root picks these up via the workspaces script.

### What is committed

| File | Covers | Tests |
|---|---|---|
| `tests/engines.test.ts` | §2 fixture pairs, language dispatch, self-describing findings, secret context | 15 |
| `tests/identifier-spelling.test.ts` | the `\b`-against-underscore trap, in six spellings each way | 19 |
| `tests/report.test.ts` | dedupe (incl. the DEP-001 collapse regression), ordering, needsReview, verdict | 9 |
| `tests/tiers.test.ts` | catalog invariants, monotonic depth, parse strictness, redaction leak-check | 12 |
| `tests/integration/precision.test.ts` | §1 OpenZeppelin ceiling, §1b four-protocol gate, fetcher exclusions | 7 |

Integration tests **skip rather than fail** without a `GITHUB_TOKEN`, since one
audit costs more than the 60 requests/hour unauthenticated GitHub allows. They
also run sequentially — parallel runs burn the rate limit and return confusing
503s instead of results.

### The gates have teeth — verified

Reintroducing the `\b` bug into the slot-context check fails **6 tests**, each
naming the spelling that breaks (`admin_slot`, `adminSlot`, `ADMIN_SLOT`,
`_adminSlot`, `_useAdminSlot`, `stored_admin_slot`). A test suite that cannot
fail is decoration, so this was checked rather than assumed.

Worth noting what that revealed: `\b` does not only break underscore spellings.
It breaks every *suffixed* identifier, because the preceding character is a word
character either way — `adminSlot` fails for the same reason `ADMIN_SLOT` does.
The blast radius of that mistake was wider than the two cases that found it.

### Still not covered

- **Recall** (§3) — the frontier-evals run. Unchanged and still the priority.
- **Payment paths** — `POST /audit` with a real settled payment. Needs a funded
  test wallet or a mocked facilitator.
- **Dynamic probes** — need a deployed x402 target to probe.
- **The `ISSUES_FOUND` boundary on live repos** — the four-protocol gate asserts
  no CRITICAL/HIGH but does not pin the MEDIUM/INFO counts, so noise can grow
  there unnoticed. Deliberate: pinning them would make the gate brittle against
  upstream commits.
