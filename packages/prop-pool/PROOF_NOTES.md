# PROOF_NOTES — how TxODDS `validate_stat` really works (source-cited)

This is the Milestone-0 deliverable: the exact internals of the TxODDS `txoracle`
scores-stat proof, derived from source, so PropPool's on-chain settlement can CPI
into `validate_stat` with confidence (and so a reader can see we actually nailed
the proof — the step most competing teams get stuck on with error `6004`).

**Sources cited below:**
- `IDL` = `packages/prop-pool/txoracle-idl/txoracle.json` (real IDL, v1.5.5, pulled
  from `github.com/txodds/tx-on-chain`).
- `SDK` = vendored reference client `packages/prop-pool/src/txline/*`
  (from `github.com/unnamed-lab/txline-anchor`, MIT; verified against live devnet
  2026-07-01). See `src/txline/VENDORED.md`.

Devnet program: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
Devnet API origin: `https://txline-dev.txodds.com` (SDK `config.ts:83`; the
sponsor's shipped examples use the now-dead `oracle-dev.txodds.com`, `config.ts:14-17`).

---

## 1. Which instruction — `validate_stat` (not `validate_stat_v2`)

The reference SDK calls **`validate_stat`** (SDK `validate.ts:194`), so that is the
proven path we build on. `validate_stat_v2` also exists (IDL:743) and takes a
`StatValidationInput` + `NDimensionalStrategy` (IDL:759-776) for multi-stat
"n-dimensional / geometric" strategies — more surface than PropPool needs. A binary
prop ("corners_total > 10", "goals < 3") maps cleanly onto `validate_stat`'s
single- or two-stat predicate form.

`validate_stat` signature (IDL:653-740):
```
validate_stat(
  ts: i64,
  fixture_summary: ScoresBatchSummary,
  fixture_proof: Vec<ProofNode>,     // API field: subTreeProof
  main_tree_proof: Vec<ProofNode>,
  predicate: TraderPredicate,
  stat_a: StatTerm,
  stat_b: Option<StatTerm>,          // for two-stat predicates
  op: Option<BinaryExpression>,      // Add | Subtract (combine stat_a, stat_b)
) -> bool
Accounts: daily_scores_merkle_roots (read-only)   // IDL:665-669
```

### Return semantics (undocumented in IDL — verified from live logs)
The IDL declares `returns: bool` but the program **does not revert on a false
predicate**. It reverts ONLY if the Merkle proof / account integrity fails
(i.e. the stat is not authentic). If the proof is valid it succeeds and returns
the predicate evaluation as **one byte of program return data** (`0x01`/`0x00`),
read from the `Program return:` log line (SDK `validate.ts:18-40`, `167-176`).

Implication for PropPool settlement: a valid proof with a *false* predicate is a
successful CPI that returns `false` — our program must read the returned bool, not
rely on a revert, to decide the winning side.

---

## 2. Leaf layout — `ScoreStat`

The innermost Merkle leaf is a `ScoreStat` (IDL:1606-1627):
```
ScoreStat {
  key:    u32,   // encoded stat key (see §5)
  value:  i32,   // the statistic's value (e.g. corners = 7)
  period: i32,   // match period discriminator
}
```
Note: `period` is its **own field**, in addition to being folded into `key` via a
period offset (see §5). Both carry period info. Populate `ScoreStat` directly from
the API's `statToProve` object (SDK `validate.ts:99`,
example `validate_scores_onchain.ts:155-160`) — do not hand-encode.

Hashes are `[u8;32]`. The API returns hash bytes as **signed** (Java-style,
−128..127) arrays; normalise to unsigned via `toBytes32` (SDK `validate.ts:46-65`)
before passing on-chain, or you corrupt the leaf.

---

## 3. Fold order — THREE directional levels

`ProofNode` carries an explicit direction flag (IDL:1585-1604):
```
ProofNode { hash: [u8;32], is_right_sibling: bool }
```
So folding is **directional**, NOT OpenZeppelin sorted-pair. At each step:
`parent = hash( is_right_sibling ? (acc ‖ sibling) : (sibling ‖ acc) )`.
(The vendored SDK passes the nodes straight through to the program, which does the
directional fold on-chain; we never sort.)

There are **three** trees, folded innermost→outermost:

| Level | Proof array (API → arg) | Folds leaf … | … up to root |
|---|---|---|---|
| 1 | `statProof` → `stat_a.stat_proof` | `ScoreStat` | `event_stat_root` (`StatTerm.event_stat_root`, IDL:1791-1823) |
| 2 | `subTreeProof` → `fixture_proof` | that scores event | `events_sub_tree_root` (`ScoresBatchSummary`, IDL:1630-1660) |
| 3 | `mainTreeProof` → `main_tree_proof` | the fixture summary | the on-chain daily root (`daily_scores_merkle_roots`) |

Corresponding error per level: L1 mismatch → `6003 InvalidSubTreeProof` (IDL:860-864)
or `6023 InvalidStatProof`; L3 mismatch → **`6004 InvalidMainTreeProof`** (IDL:866-869).

Field-name gotcha: the API summary field is `eventStatsSubTreeRoot` but the on-chain
`ScoresBatchSummary` field is `eventsSubTreeRoot` — the SDK remaps it
(`validate.ts:78-90`). Get this wrong → the level-3 fold fails → 6004.

---

## 4. Root PDA resolution + what actually causes 6004 (VERIFIED on devnet)

`validate_stat` reads a single account, `daily_scores_merkle_roots`. Despite the
`insert_scores_root` writer taking `epoch_day:u16 / hour_of_day:u8 /
minute_of_hour:u8` (IDL:262-313), the **read** PDA is a *daily* account keyed by
epoch day only:

```
seeds = ["daily_scores_roots", epochDay as u16 LE (2 bytes)]   // SDK pdas.ts:62-70
epochDay = floor(timestampMs / 86_400_000)                     // SDK pdas.ts:22-24  (MILLISECONDS!)
```

### Correction to the common assumption (verified 2026-07-05 on devnet)
A widely-repeated claim is "wrong bucket ⇒ 6004". **That is wrong.** We tested both:

- **Wrong bucket** (pass the previous day's root PDA with the correct `ts`):
  rejected as **`ConstraintSeeds` (2006)** — `A seeds constraint was violated` —
  BEFORE any proof math. The program re-derives the expected root PDA from the
  `ts` arg and constrains the passed account by seeds, so you literally *cannot*
  submit a mismatched bucket. You never reach 6004 this way.
- **Corrupted main-tree proof** (correct bucket, one flipped byte in
  `main_tree_proof`): rejected as **`6004 InvalidMainTreeProof`**, thrown at
  `programs/txoracle/src/instructions/merkle/validate_stat.rs:73` —
  "Invalid main tree proof. The summary does not belong to the on-chain root."

So **6004 is a proof-integrity failure at the outermost fold**, not a bucket bug.
Real-world 6004 causes: passing the wrong `ts` (so the correct proof is checked
against the wrong day's root — see the 6010 note below for the pre-check),
corrupted/reordered `main_tree_proof` nodes, wrong sibling direction, or the
`eventStatsSubTreeRoot`→`eventsSubTreeRoot` field-name mismatch (§3). Get the
bucket right by deriving `epochDay` from `summary.updateStats.minTimestamp`; get
6004-free by passing the proof arrays through unmodified (via the SDK's `toBytes32`
byte normalisation).

### The timestamp trap (error 6010)
The `ts` used for BOTH epoch-day seed derivation and the on-chain equality check is
the batch **START** timestamp = `summary.updateStats.minTimestamp`, NOT the
top-level event `ts`. Passing the event `ts` → `6010 TimestampMismatch`
(SDK `validate.ts:119-131`). PropPool stores `minTimestamp`'s epoch day at
`create_prop` time so the crank resolves the exact bucket at settle time.

Related errors: `6007 RootNotAvailable` (no root posted for that slot yet,
IDL:880-884), `6013 InvalidTimeSlot` (must align to 5-min boundary, IDL:910-914).

---

## 5. Soccer stat-key encoding (`key: u32`)

Base keys × period offset (SDK `statKeys.ts:14-45`):
```
base:   P1_GOALS=1 P2_GOALS=2 P1_YELLOW=3 P2_YELLOW=4
        P1_RED=5   P2_RED=6   P1_CORNERS=7 P2_CORNERS=8
period offset (added to base): FULL_GAME=0 H1=1000 H2=2000 ET1=3000 ET2=4000 PENALTIES=5000
```
e.g. `statKey(P2_GOALS,"H2") = 2002`. There are only these 8 base stats × 6 periods;
PropPool predicates must be built from stats that exist in this encoding. Odds have
only batch-level membership proofs (`validate_odds`) — no per-stat threshold — so
prop predicates are scores-only (SDK `validate.ts:243-252`).

---

## 6. Predicate + comparison shapes (for PropPool)

```
TraderPredicate { threshold: i32, comparison: Comparison }     // IDL:1885-1902
Comparison = GreaterThan | LessThan | EqualTo                  // IDL:1261-1275
BinaryExpression = Add | Subtract                              // IDL:1247-1258 (two-stat)
```
Anchor TS enum form: `{ greaterThan: {} }`, `{ lessThan: {} }`, `{ equalTo: {} }`.
A prop "total corners (P1+P2) > 10" = two stats (`P1_CORNERS`, `P2_CORNERS`) with
`op = Add` and `predicate = { threshold: 10, comparison: greaterThan }`.

---

## 7. Auth / subscription gotchas (blockers others hit)

- Full flow: `POST /auth/guest/start` → on-chain `subscribe(1, weeks)` → sign
  `${txSig}:${leagues}:${jwt}` (ed25519, base64) → `POST /api/token/activate` →
  call data endpoints with BOTH `Authorization: Bearer <jwt>` and
  `X-Api-Token: <token>` (SDK `auth.ts`, `client.ts:19-31`).
- `weeks` must be a **multiple of 4** (min 4); `weeks=1` (in the sponsor's old
  examples) is rejected → `6041 InvalidWeeks` (SDK `subscribe.ts:26-29`, IDL:1050-1054).
- Free World Cup tier = service level `1` (60s delay).
- Compute: `validate_stat` needs a raised CU limit (SDK requests up to ~1.4M,
  `validate.ts:42-43`).

---

## 8. Live devnet run — RESULTS ✅ (2026-07-05)

Produced by `npm run m0` (`scripts/m0-validate-stat.ts`); raw artifact at
`artifacts/m0-proof-18187298-1050.json`. **Milestone 0 exit gate: GREEN.**

- **Fixture:** `18187298` — Brazil vs Norway (free World Cup tier, devnet)
- **Seq / stat:** seq `1050`, statKey `1` (P1_GOALS), `value=0`, `period=4`
- **Batch ts:** `1783288501881` ms → **epochDay `20639`**
- **`daily_scores_roots` PDA:** `7FwXux2xDDCLngnWiJceaXr2h1bDeBe5uKAsmYQruHL3`
  — confirmed present on devnet (**9232 bytes**)
- **Proof depths:** statProof `2`, subTreeProof `7`, mainTreeProof `1`
  (the three directional levels of §3)
- **Predicate via simulation:** `0 < 1 ⇒ true`, `0 < -1 ⇒ false` ✅
- **Real `validate_stat` tx (SUCCESS):**
  `RWmDw6WEzbMUYfwqy1qvpU4UVDgh8FcuzpLqXitsMdJCaM4AthKwa25h1awSfe6bgGwnpgs8DdFUBq9ft3yRdyB`
  → [explorer](https://explorer.solana.com/tx/RWmDw6WEzbMUYfwqy1qvpU4UVDgh8FcuzpLqXitsMdJCaM4AthKwa25h1awSfe6bgGwnpgs8DdFUBq9ft3yRdyB?cluster=devnet),
  `predicateResult = true`
  (earlier successful runs: `5CHBBzwUJu1G…MJjB`, `4C6nbLkK6X5L…jZ7P`)

### Failure modes reproduced (both, with exact on-chain errors)
- **Wrong bucket** (prev-day PDA, correct ts):
  `AnchorError … account: daily_scores_merkle_roots. Error Code: ConstraintSeeds.
  Error Number: 2006.` — rejected before proof math (program self-defends the bucket).
- **Corrupted main_tree_proof** (correct bucket, one flipped byte):
  `AnchorError thrown in …/merkle/validate_stat.rs:73. Error Code:
  InvalidMainTreeProof. Error Number: 6004. … The summary does not belong to the
  on-chain root.` — this is the true source of 6004.

**Takeaway for PropPool settlement:** derive the root bucket from
`summary.updateStats.minTimestamp` (stored at `create_prop`), pass the API proof
arrays through unmodified (with signed→unsigned byte normalisation), and read the
returned predicate bool from CPI return data. See §4 for the corrected 6004 model.
