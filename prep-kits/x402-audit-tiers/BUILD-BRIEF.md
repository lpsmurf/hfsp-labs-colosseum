# Build brief — x402-audit-tiers

What exists, what is next, and what blocks each thing. Ordered by value per unit
of work, not by tier number.

## Done

| Item | Where |
|---|---|
| T0 preview endpoint (free, redacted) | `GET /audit/preview` |
| T1 tier-gated paid scan | `GET/POST /audit?tier=T1` |
| Tier catalog endpoint | `GET /audit/tiers` |
| Engine gating by tier | `src/tiers.ts` + `src/static/index.ts` |
| Unavailable tiers return 501 with `blockedOn` | `src/routes/audit.ts` |
| Solidity engine (17 rules, SWC/CWE-tagged) | `src/static/solidity.ts` |
| Solana/Anchor engine (10 rules) | `src/static/solana.ts` |
| Verification-cache engine (4 rules, incl. C++) | `src/static/verify-cache.ts` |
| Supply-chain engine (6 rules) | `src/static/supply-chain.ts` |
| OSV advisories + patch age | `src/supply/index.ts` |
| Confidence + SWC/CWE refs + coverage map | `src/report.ts` |
| Rate-limit vs not-found error split | `src/github.ts` |

## Next — in order

### 1. Set `GITHUB_TOKEN` *(blocking, minutes)*

`.env` has the key with an **empty value**, so the service runs unauthenticated
at 60 requests/hour. One audit spends 1 + 1 + 1 + up to 120 files + up to 8
commit lookups ≈ **131 requests**, so a single T1 scan exceeds the hourly cap.

**The product does not work in production until this is set.** A fine-grained
token with public-repo read is enough and lifts the ceiling to 5,000/hour.

### 2. Measure recall against `frontier-evals` *(prices everything else)*

Precision is measured; recall is not. Until we have that number we cannot price
T2 honestly, cannot claim what any tier catches, and should not sell T4.

If T1 recall is ~5%, T2 is not an upsell — it is the product, and T1 is the
teaser. That single number changes the roadmap, so it comes before more rules.

### 3. Lockfile ingestion *(small, removes a caveat)*

Every `DEP-001` finding currently admits it read the version from a range
specifier rather than a lockfile, so the installed version may differ. Fetching
`package-lock.json` / `Cargo.lock` and resolving exact versions removes that
caveat and unlocks the transitive tree.

Watch the file budget: lockfiles are large, so fetch and parse without counting
them against the 120-file analysis cap.

### 4. T2 build host + async jobs *(the real unlock)*

Requires:
- A host with `solc` (multi-version, via `svm`), `aderyn`, `slither`, `semgrep`.
- An async job store — T2 runs 2–10 minutes, which cannot sit in a request.
  Job id + poll endpoint, or a webhook.
- Payment held against a job id rather than a response.

**Aderyn first.** Rust, fast, no per-project `solc` juggling, closest to drop-in.
Slither second, and only after `solc` version selection is solved. Semgrep last —
already deferred pending a stronger VPS.

The payoff is not just more rules: every false positive documented in
`auditor-toolkit.md` came from file-local regex being unable to resolve
inheritance. T2 is where those rules stop guessing.

### 5. T0 funnel instrumentation *(cheap, informs pricing)*

Count preview → paid conversion. If previews do not convert, the redaction line
is drawn in the wrong place and should be re-cut, not the price.

## Not building

| Item | Why |
|---|---|
| T5 continuous monitoring | Wrong product for us — crowded incumbents, enterprise sales, 24/7 staffing at 20× infra cost. See `x402-audit/pipeline/module-3-bridge-monitor.md`. |
| Circuit breaker | Four of seven requirements are legal/governance, all blocking. See `x402-audit/pipeline/module-4-circuit-breaker.md`. |
| Clarity / Move rules | No verified expertise. A false "all clear" is worse than an honest gap — the coverage map states it instead. |
| General C++ auditing | Only the cache rules run on C++, deliberately. Real C++ security is clang-tidy/CodeQL territory. |

## Open question worth deciding early

**Where the T0 redaction line sits.** Today T0 returns counts with no titles or
locations. Alternatives: return titles but not locations, or return one full
finding as a sample. Counts are the most conservative and the least useful; a
sample finding converts better but gives away more. Decide with data from item 5,
not by argument.
