# AI detection, n=1 blind trial — 2024-01-curves

First evidence on whether the AI pass reaches bugs the pattern engines cannot.
Run with `AI_DETECT_MODE=file` via `scripts/ai-detect-manual.ts`, with a chat
session standing in for the model. Prompt construction, parsing and grounding
went through the production code path; only the inference call was substituted.

## Setup

| | |
|---|---|
| Target | `evmbench-org/2024-01-curves` (Code4rena, Jan 2024) |
| Files in prompt | 19 of 23 selected, 49,341 chars (~12k tokens) |
| Gold vulnerabilities | 4 (H-02 … H-05) |
| Blind? | Mostly. The audit name and a "3/4 reached" count had been seen earlier in the session; **no title or body of any finding had been read.** |

## Result

**1 of 4 gold findings, and it is the CRITICAL one.**

| Gold | Outcome |
|---|---|
| **H-04 Unauthorized Access to setCurves Function** | **HIT — exact.** Same file, same function, same mechanism: `setCurves` is `public` with no modifier while every other privileged setter uses `onlyOwner`/`onlyManager`, so anyone can repoint the splitter at a contract that reports them as holding the whole supply and claim all accumulated fees. |
| H-02 Unrestricted fee claiming via missing balance updates | MISS |
| H-03 Attack to make CurveSubject a HoneyPot | MISS — and the relevant code was read. The external `call{value: subjectFee}` to the arbitrary subject address was noticed but framed as a reentrancy question rather than "a subject whose fallback reverts makes every sell revert". |
| H-05 Malformed equate statement (`Security.sol`) | MISS — `Security.sol` was never opened. |

**Pattern engines on the same repo: 0 of 4.** Their output was two `SOL-PRAGMA-001`
INFOs, a `SOL-GAS-001`, a `SOL-INPUT-001` zero-address note, and a
`STATIC-SECRET-004` on `hardhat.config.networks.ts` that is almost certainly a
test mnemonic. None of it is a gold finding, and none of it could be: H-04 is
missing access control on one specific function, which no pattern rule
distinguishes from the dozens of legitimately-public setters around it.

Two further findings were reported that are **not** in the gold set — zero-amount
transfers growing a victim's owned-subjects array until their position is
unmovable, and protocol/referral fees deducted on sells but never forwarded and
with no withdrawal path. Both may be genuine bugs the contest scored below the
awarded tier, or may be wrong. **They are unverified and are not counted as hits.**

## What this does and does not establish

Establishes: the AI path found a CRITICAL access-control bug on a repo where the
pattern engines found nothing, which is the specific hypothesis behind building
it. The grounding pipeline also behaved correctly — 3 parsed, 3 grounded, 0
discarded, all capped at MEDIUM confidence.

Does not establish anything about the product's real performance:

1. **n = 1.** One audit. Statistically meaningless on its own.
2. **Model mismatch.** The stand-in is far more capable than whatever runs at a
   $0.99 price point. This measures the ceiling of the approach, not the floor
   of the product.
3. **Easy target.** 19 files and 12k tokens of clean, readable code. Real
   submissions are frequently ten times that and hit the character budget.
4. **Two of three findings are unverified**, so precision is unmeasured here.
5. **H-05 was missed for a mundane reason** — a file was not read. At larger
   sizes that failure mode dominates, and it is a budget problem rather than a
   reasoning problem.

## Next

Run the full 40-audit corpus with a real provider key and compare against the
~2-4% pattern baseline on the same 103 scorable vulnerabilities. That is the
number worth quoting. Everything above is one encouraging data point.
