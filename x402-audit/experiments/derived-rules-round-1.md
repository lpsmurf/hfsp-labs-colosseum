# Derived rules, round 1 — access control and unchecked arithmetic

Date: 2026-09-12
Engines: `SOL-AC-001/002/003` (access control), `SOL-MATH-001` (unchecked subtraction),
plus the attack-surface inventory on `AuditReport.attackSurface`.

First rules written under the derive/holdout protocol in [README.md](README.md).
Both numbers are reported, as that protocol requires.

## Why these two

Mechanism ranking over the 78 derive-half findings put the largest class —
accounting and share-index errors, 21% — beyond anything a pattern rule can
see. The two tractable classes were missing access control (5%) and
stuck/griefable funds (6%). Neither had any rule at all:

* `SOL-PROXY-001` only inspects initializers.
* `SOL-INPUT-001` checks a privileged setter for a zero-address check while
  *assuming* it is privileged in the first place.
* Nothing in the platform looked at `unchecked`.

## Precision, measured first

Five repeatedly-audited protocols, 312 files, through the product's own
`selectFiles()`:

| repo | files | SOL-AC / SOL-MATH findings |
|---|---|---|
| aave-v3-core | 120 | 0 |
| openzeppelin-contracts | 120 | 0 |
| solmate | 23 | 0 |
| Uniswap v2-core | 13 | 0 |
| Uniswap v3-core | 36 | 0 |

**The first pass produced 32 findings and all 32 were false.** That is the
result worth recording, because the eight suppression rules the engines now
carry were each derived from a named false positive rather than imagined in
advance:

| class | where it came from |
|---|---|
| formal-verification harnesses | aave `certora/harness/` — 21 unguarded setters so the prover can drive reserve config. Now excluded by path. |
| caller compared through a local alias | OZ 5.x `address caller = _msgSender(); if (caller != authority())` — made `AccessManaged.setAuthority` and `TimelockController.updateDelay` read as unguarded HIGHs |
| caller-keyed record | ERC721/ERC1155 `setApprovalForAll`, ERC6909 `setOperator`, aave `setUserEMode` — the caller is the subject |
| forwarder to own overload | aave `L2Pool` calldata-compression shim; guard and scope live in the callee |
| `skim` as a sweep | AMM term of art for taking the surplus above recorded reserves; permissionless in Uniswap v2 and every fork |
| body that only emits | phi `PhiNFT1155.setContractURI()` — declines to be `view`, writes nothing |
| delegatecall-context check | reNFT `Reclaimer` authorises with `address(this) != rentalOrder.rentalWallet` |
| bound from an earlier *checked* subtraction | solmate `ERC20._burn` — `balanceOf[from] -= amount;` then `unchecked { totalSupply -= amount; }` |

Each has a test naming the protocol it came from, so none can return quietly.

`emit` is stripped before the caller-scope test. Suppressing on any mention of
`msg.sender` would silence every genuine finding in a contract that logs who
called, and there is a test for that direction too.

## Recall, both halves

40 corpus repos, 103 scorable gold vulnerabilities.

| | derive (24 audits) | holdout (17 audits) |
|---|---|---|
| gold scorable | 68 | 35 |
| whole platform, any finding | 61.8% (chance 21.1%, **2.9×**) | 65.7% (chance 30.5%, **2.2×**) |
| whole platform, CRITICAL/HIGH | 38.2% (chance 6.5%, **5.9×**) | 40.0% (chance 11.1%, **3.6×**) |
| reached by SOL-AC / SOL-MATH | 6 / 68 = 8.8% | 1 / 35 = **2.9%** |

"Reached" is a file-level ceiling: it counts flagging the right file for any
reason. Hand-graded, the new rules' hits are:

**Precise — right function, right mechanism:**

* `2024-01-curves` H-04, *"Unauthorized Access to setCurves Function"* →
  `SOL-AC-001  FeeSplitter.setCurves()`. Derive half; this is the rule's origin
  case, so it confirms the implementation and proves nothing about
  generalisation.
* `2026-01-tempo-stablecoin-dex` H-04, *"Integer underflow in balance
  subtraction allows draining DEX liquidity"* → `SOL-MATH-001
  StablecoinDEX._processWithdrawal() [balances]`. Same caveat: origin case.
* **`2025-04-virtuals` H-03, *"Public ServiceNft::updateImpact call leads to
  cascading issues"* → `SOL-AC-001  ServiceNft.updateImpact()`. Holdout half.**
  This is the one result that carries weight: a rule written from `setCurves`
  in the derive half landed on the exact named function of a paid CRITICAL in
  an audit that was never read. Graded from the gold *title* alone — the
  writeup and source were not opened, to keep the half clean for later rounds.

**Coincidental file match, not a find:** curves H-02, tempo H-02,
pooltogether H-02/H-04.

## What this does and does not establish

The access-control rule generalises: it found an unguarded public state-changer
in never-seen code, at function granularity, with zero false positives across
312 files of audited protocols. That is a real capability the platform did not
have this morning.

It is also **n=1 on the holdout half**. One hit out of 35 is not a recall
figure, it is an existence proof. The honest summary is: the rule works, the
class it covers is roughly 5% of paid findings, and 5% of 35 is between one and
two — so this is about what a working rule should produce, which is the most
that can be claimed from a single observation.

Two instructive near-misses stayed instructive rather than being counted:

* Panoptic H-01/H-02. `SOL-MATH-001` fired on `computeNAV()` at
  `poolExposure0`/`poolExposure1` — **the exact variables the gold CRITICAL is
  about**. But those are `int256`, the real bug is a wrong-sign accounting
  error, and the finding said the wrong thing about the right code. It scored
  as a hit on the file-level benchmark and would have been worth nothing to an
  auditor. The rule now skips signed targets. This is the clearest example in
  the corpus of why file-level reach must never be reported as recall.
* PoolTogether `_liquidatableBalanceOf` — a genuine unbounded subtraction, but
  on a local rather than storage. Kept as a finding, demoted to MEDIUM/LOW.

## Also fixed

* `tests/fixtures/clean.sol` asserted zero findings while its `setOwner()` was
  externally callable with no caller check. Written to silence the rules that
  existed, and quietly a real takeover.
* `SOL-MATH-001` findings in one function shared an id and location, so
  `buildReport`'s id+location dedupe collapsed them — the same defect that once
  merged eight dependency advisories into one. The subtraction target is now
  part of the location, which is how `poolExposure0` and `poolExposure1` became
  visible as two findings instead of one.
* `recall-bench.ts` now reports the two halves separately and takes
  `--rules=PREFIX` so a new engine is credited on its own rather than hidden
  inside the platform total.

## Round 1b — DoS and griefing (`SOL-DOS-002`, `SOL-DOS-003`)

Added after the above, same protocol. Grounded in two derive-half findings:

* noya H-04, *"executeWithdraw may be blocked if any of the users are
  blacklisted from the baseToken"* — a withdraw queue drained in a `while` loop
  that `safeTransfer`s to each receiver in turn. One blacklisted receiver at
  the head reverts the transaction and blocks everyone behind them permanently.
* reNFT / althea — an array an arbitrary caller can grow, iterated somewhere
  that has to succeed, is a gas-limit lock waiting to be set.

Precision: **0 findings** across the same 312 files, after two fixes the
measurement forced:

| class | where it came from |
|---|---|
| batch executor mistaken for a payout | OZ `Governor._executeOperations`. `call{value: v}("")` sends ETH; `call{value: v}(calldatas[i])` invokes a function, and a loop of those is deliberately all-or-nothing — a half-executed proposal is worse than a reverted one. |
| single fixed recipient | benddao `VaultLogic.erc721TransferOutLiquidity` — one `to`, only the token id varying. Nobody is behind anybody in that queue. Four of these were the engine's *entire* holdout-half output, and all four were false. |

One capability gain the measurement also forced: `SOL-DOS-003` now resolves one
level of call graph, because althea grows `holders` inside
`_afterTokenTransfer`, which every ordinary transfer reaches. Solidity calls
hooks itself, so no caller names them and a direct-push check misses the case
entirely — and the paid finding is precisely that the holders array can be
manipulated that way. With the hook rule it lands on the right function.

### Result: unvalidated

| | derive | holdout |
|---|---|---|
| gold with a DoS/griefing-shaped title | 2 / 78 | 2 / 40 |
| reached by `SOL-DOS` | **1–2 of 2** | **0 of 2** |

This is a **miss on the holdout half, not an empty class.** The class is
present there, twice, and neither instance was reached.

`n = 2` on each side cannot discriminate between a rule that works and a rule
that memorises, so the protocol's revert test does not apply cleanly. The rules
are kept because they cost nothing in precision (0 findings on 312 files of
audited code), because the mechanism is structural rather than keyed to
anything in the derive set, and because the noya hit is a mechanism-level match
— right function, right failure mode — not a file coincidence.

**But nothing may be claimed for them.** They do not count toward any
capability statement until the holdout number is non-zero. The open question,
deliberately not chased here because diagnosing it means reading holdout
writeups, is whether the two misses are rule gaps or file-selection gaps —
whether the vulnerable file was even inside the 120-file budget.

Derive-half hits that are *not* claimed as finds: nextgen H-02 (the gold is a
`block.timestamp` boundary bug; the loops flagged are separately DoS-able but
that is not what was paid for), taiko H-02, noya H-10.

## Next

* Diagnose the two holdout DoS misses — rule gap or file-selection gap.
* More blind AI trials through the file transport; the reasoning layer is the
  only thing that can reach the 21% accounting class.
* Neither of these rules covers Solana, Clarity or Move. `SOL-AC` is
  Solidity-only by construction.
