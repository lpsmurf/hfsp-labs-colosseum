# Blind AI-detection trials — holdout half, round 1

Date: 2026-09-13
Path: production `buildDetectPrompt` → answer → production `extractJson` +
`groundFindings`. Only the inference call is substituted, by a chat session
(Claude Opus 5) answering the prompt file.

## Protocol

1. **Target selection without exposure.** Holdout-half audits only, excluding
   every audit whose gold title had appeared in this session (virtuals, phi,
   benddao, ethereumcreditguild). Filtered further to repos with no
   finding-named or PoC-named files, that fit the character budget, and are as
   recent as possible.
2. **Answers committed before grading.** All three responses were written, then
   committed at `df90b6e` with a SHA-256 of each exact prompt, *before* any gold
   `config.yaml` was opened. Git history is the proof of ordering.
3. **Graded through the product.** Every answer went through the same parsing
   and grounding code a paid audit uses; nothing was discarded as ungrounded.
4. **Hit = mechanism match**, not file match. A finding counts only if it names
   the same defect the gold title names.

## Result

| audit | contract code | gold | AI | patterns |
|---|---|---|---|---|
| 2026-01-tempo-mpp-streams | 1 file, 21k chars | 1 | **1 / 1** | 0 / 1 (partial pointer) |
| 2025-02-thorwallet | 2 files, 34k chars | 1 | **1 / 1** | 0 / 1 |
| 2025-01-liquid-ron | 9 files, 38k chars | 1 | **1 / 1** | 0 / 1 |
| **total** | | **3** | **3 / 3** | **0 / 3** |

The matches, gold title first:

* **tempo H-03** *"Authorized signer validation bypass via zero address signature
  recovery"* ↔ *"authorizedSigner of address(0) lets any invalid signature settle
  the full deposit"*. Same lines, same exploit.
* **thorwallet H-01** *"MergeTgt has no handling if TGT_TO_EXCHANGE is exceeded
  during the exchange period"* ↔ *"TITN owed is never capped at the deposited
  allocation, so over-subscription makes late claims … revert"*.
* **liquid-ron H-01** *"The calculation of totalAssets() could be wrong if
  operatorFeeAmount > 0"* ↔ *"Accrued operator fees are counted in totalAssets,
  inflating the share price"*.

The pattern engines' closest approach was `SOL-SIG-001` on tempo — *raw
ecrecover without zero-address handling* — which names an ingredient of H-03 at
file level without the part that makes it exploitable (the signer itself being
settable to zero). Counted as a miss.

### Extra findings — not counted

Three AI findings are outside the gold set and **unverified**: tempo's
payer-only cooperative close and anyone-can-`initiateClose`, and thorwallet's
freeze-by-dust-bridge on `isBridgedTokenHolder`. They may be real bugs the
contest scored below the awarded tier, or wrong. Precision on this trial is
therefore somewhere between 3/6 and 6/6 and is **not measured**.

### Pattern false positives found while building the baseline

Fixed, with tests:

* `SOL-RAND-001` fired at HIGH on tempo's channel-id derivation,
  `keccak256(abi.encodePacked(msg.sender, payee, token, block.timestamp,
  counter))`. Hashing a timestamp is not using it as randomness; the rule now
  requires evidence the value picks an outcome.
* `SOL-INPUT-001` asked for a zero-address check on liquid-ron's
  `setOperatorFee(uint256)` and `updateOperator(address, bool)`.

Removing them lowered holdout CRITICAL/HIGH file-level reach from 14 to 13 of
35 — one of those false HIGHs happened to sit in a gold file — while the chance
baseline fell further, so lift rose from 3.62× to 3.86×. Recorded because it is
exactly the kind of number that would look like a regression if reported
without the control.

## Cumulative

| | audits | gold | AI | patterns |
|---|---|---|---|---|
| n=1 (curves, derive half) | 1 | 4 | 1 | 0 |
| this round (holdout half) | 3 | 3 | 3 | 0 |
| **total** | **4** | **7** | **4 / 7** | **0 / 7** |

## What this does not establish — read before quoting any of it

1. **The stand-in is not the product.** Opus 5 answering by hand is the ceiling
   of the approach. The configured default for a paid run is a cheaper model,
   and the gap between them on this task is unmeasured.
2. **Training-data contamination cannot be excluded.** All three contests
   predate the model's knowledge cutoff and their reports are public. The
   answers show independent reasoning and include findings the gold set does
   not contain, which argues against pure recall, but it does not rule it out.
   The next rounds should prefer audits published after the cutoff of whatever
   model is being tested.
3. **These are the easiest repos in the corpus.** One to nine contract files,
   under 40k characters, every file fitting in the prompt. Most of the corpus is
   5-30× larger and hits the budget, where the curves H-05 failure — the
   relevant file never read — starts to dominate.
4. **One gold finding each.** 3/3 is also 3 data points. Small single-bug repos
   make recall look better than a 20-finding contest would.
5. **Precision is unmeasured** (see above).

What it does establish: on small, unseen, never-graded repos, the reasoning
layer reaches the accounting and signature-logic bugs the pattern engines
structurally cannot, at mechanism granularity, through the product's own
pipeline. That is the hypothesis the AI layer was built on, and it has now
survived a test designed to be able to fail.

## Next

* A real-provider run with the model a $0.99 tier would actually use, on the
  same three audits, to measure the ceiling-to-product gap directly.
* Larger holdout audits (traitforge 59k, sequence 178k) to see where the budget
  starts losing findings.
