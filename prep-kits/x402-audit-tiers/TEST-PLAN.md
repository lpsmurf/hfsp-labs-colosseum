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
13  SOL-PRAGMA-001  [LOW/HIGH]       floating pragma on deployable proxies
 3  SOL-INPUT-001   [MEDIUM/MEDIUM]  zero-address setters
 2  SOL-DELEGATE-001[HIGH/LOW]       delegatecall in proxies (by design)
 1  SOL-4626-001    [INFO/LOW]       ERC4626 checklist prompt
 1  SOL-HASH-001    [MEDIUM/MEDIUM]
 1  SOL-SIG-001     [HIGH/MEDIUM]
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

## 3. Recall — `frontier-evals` *(NOT YET RUN — the priority)*

Target: the [`frontier-evals`](https://github.com/openai/frontier-evals) corpus
via [`paradigmxyz/evmbench`](https://github.com/paradigmxyz/evmbench) — contracts
with known, independently-chosen bugs.

Method: run T1 engines over each target, compare against the answer key, report
`caught / total` by severity.

**Expect a low number.** The benchmark tests deep multi-step reasoning across a
codebase; our engines are file-local pattern matchers. A single-digit result is
the likely and acceptable outcome — the number is a *spending decision input*
(more rules vs. move to T2), not a grade.

Blocked on: nothing. This should be run next.

## 4. Tier behaviour *(automated, verified)*

| Case | Expected | Verified |
|---|---|---|
| `GET /audit/tiers` | all 5 tiers, `available` flags, `blockedOn` on unavailable | ✅ |
| `GET /audit?tier=T2` | **501**, names what is blocked, does not quote a price | ✅ |
| `GET /audit?tier=BOGUS` | **400**, lists valid tiers, no silent downgrade | ✅ |
| `GET /audit?tier=T0` | **400**, redirects to `/audit/preview` | ✅ |
| `GET /audit` (no tier) | **402** at T1 price, `amount` = `990000` (6dp) | ✅ |
| 402 body | `audit.tier`, `notIncluded[4]`, `upgrade[T2,T3,T4]` | ✅ |
| `GET /audit/preview` | counts only, `findings: []`, `preview.redacted: true` | ⚠️ blocked on token |
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
| Patch-age scoped to `criticalPaths` only | ⚠️ needs a token to exercise |
| Dynamic probes against a live x402 endpoint | ⚠️ needs a deployed target |

## Running it

```bash
cd packages/x402-audit-api
npx tsc --noEmit          # must be clean
# precision baseline, fixtures, and tier checks are currently ad-hoc scripts —
# folding them into a committed test suite is item 0 of the next pass
```

**Known gap in this plan:** none of §1–§3 is a committed test yet. They were run
as throwaway scripts. Turning §1 and §2 into a real suite with the ≤30-finding
gate is prerequisite to trusting any future rule change.
