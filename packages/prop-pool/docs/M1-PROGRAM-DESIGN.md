# M1 — `prop_pool` Anchor program design

The differentiated core: an escrow program that holds user stakes and settles a
parametric prop **trustlessly** by CPI-ing into the deployed TxODDS `txoracle`
program's `validate_stat`. We do NOT re-implement an oracle. Trust root = TxODDS's
on-chain `daily_scores_merkle_roots` PDA.

> Prereq: Rust + Solana CLI + Anchor toolchain (not yet installed). Program is
> **UNAUDITED, devnet-only**.

Grounded in `PROOF_NOTES.md` (verified live 2026-07-05) and the vendored SDK
(`src/txline/`). Where this doc and the M0 findings differ from earlier guesses,
the M0 findings win.

---

## Key M0-verified facts that shape this design

1. **`validate_stat` returns a bool via program return data** and reverts only on
   invalid proof (PROOF_NOTES §1). `settle` must read the returned bool with
   `get_return_data()` to decide the winning side — a valid proof + false predicate
   is a *successful* CPI returning `false`, not a revert.
2. **CU is NOT a blocker.** `validate_stat` consumes **~193K CU in practice**
   (SDK `validate.ts:37-39`; the 1.4M is only the requested ceiling). A CPI plus our
   escrow logic fits comfortably under the 1.4M per-tx limit. The real limit to
   watch is **transaction size** (proof arrays are large) — see Risks.
3. **The root account is self-defended.** Passing a wrong-bucket PDA fails with
   `ConstraintSeeds (2006)` inside txoracle (PROOF_NOTES §4), so `settle` can accept
   `daily_scores_merkle_roots` as an `UncheckedAccount` and let the CPI enforce it —
   no need to duplicate the seeds constraint in our program (though we still store
   the expected `epoch_day` so the crank derives the right account).
4. **Bucket = epochDay from `summary.updateStats.minTimestamp`** (ms), stored at
   `create_prop`. Passing the wrong `ts` → `6010 TimestampMismatch`.

---

## Instruction set

### `create_prop(args)` — signer: `creator`
Creates the `Prop` PDA + escrow vault (PDA-owned SPL token account). Args:
- `fixture_id: i64`, `stat_key: u32`, `period: i32`
- optional `stat_key_b: Option<u32>`, `op: Option<BinaryExpr>` (two-stat, e.g. total corners = P1+P2)
- `threshold: i32`, `comparison: Comparison`
- `stake_mint: Pubkey` (devnet USDC), `min_deposit: u64`
- `join_deadline: i64`, `settle_after: i64`
- `expected_epoch_day: u16` (from `minTimestamp`; lets the crank/`settle` resolve the root bucket)
- `creator_side: bool`
Validates deadlines are in the future; sets `status = Open`.

### `join(side: bool, amount: u64)` — signer: `user`
Transfers `amount` of `stake_mint` from the user's ATA into the vault; creates a
`Position` PDA (`["position", prop, user]`). Rejects after `join_deadline` or below
`min_deposit`. Updates `total_pool`, `over_stake`/`under_stake`.

### `settle(proof_args)` — signer: `settler` (permissionless)
1. Requires `status == Open` and `now >= settle_after` (idempotency + timing).
2. Requires `proof_args.ts` maps to `prop.expected_epoch_day` (defense-in-depth).
3. Builds `TraderPredicate` from stored `threshold`/`comparison`.
4. **CPI** into `txoracle::validate_stat` passing the `daily_scores_merkle_roots`
   account + the caller-supplied proof args (`ts`, `fixture_summary`,
   `fixture_proof`, `main_tree_proof`, `stat_a`, `stat_b?`, `op?`).
5. Reads the returned bool via `get_return_data()` (verify program id == txoracle).
6. Sets `winning_side = returnedBool`, `status = Settled` (or `Refundable` if one
   side has 0 stake). Invalid proof → CPI reverts → whole tx reverts, stays `Open`.

### `claim()` — signer: `user`
Requires `status == Settled` and `position.side == winning_side`. Pays pro-rata
(see below) from vault → user ATA; closes `Position` (rent back to user). Losers
rejected. `Position` close prevents double-claim.

### `refund()` — signer: `user`
Requires `status == Refundable` (unopposed prop). Returns the user's full stake;
closes `Position`.

### `close_prop()` — signer: `creator` (optional)
Closes an expired, empty (`total_pool == 0`) prop + vault, rent back to creator.

---

## Accounts / PDAs

**`Prop`** — seeds `["prop", fixture_id.le, creator]`
```
fixture_id:i64, creator:Pubkey, stake_mint:Pubkey,
stat_key:u32, period:i32, stat_key_b:Option<u32>, op:Option<BinaryExpr>,
threshold:i32, comparison:Comparison,
expected_epoch_day:u16, min_deposit:u64,
join_deadline:i64, settle_after:i64,
status:PropStatus, total_pool:u64, over_stake:u64, under_stake:u64,
winning_side:bool, settled_at:Option<i64>, bump:u8
```
**`Position`** — seeds `["position", prop, user]`: `prop, user, side:bool, stake:u64, bump`
**Vault** — seeds `["vault", prop]`: SPL token account, `authority = prop` PDA.

Enums: `PropStatus{Open,Settled,Refundable}`, `Comparison{GreaterThan,LessThan,EqualTo}`,
`BinaryExpr{Add,Subtract}` — mirror the IDL enums (PROOF_NOTES §6).

---

## The `settle` CPI — how to call txoracle

Two options; **prefer `declare_program!`** (Anchor 0.30) which generates a typed CPI
client from `txoracle-idl/txoracle.json` and mirrors the exact arg types — far less
error-prone than hand-serializing the discriminator + borsh. Fallback is a manual
`invoke` with discriminator `[107,197,232,90,191,136,105,185]` (IDL:655-663).

Reading the result:
```rust
let (pid, data) = anchor_lang::solana_program::program::get_return_data()
    .ok_or(PropError::NoReturnData)?;
require_keys_eq!(pid, txoracle_program.key(), PropError::WrongProgram);
let predicate = data.first().copied().unwrap_or(0) != 0;
```
Account for the CPI: just `daily_scores_merkle_roots` (read-only). Our program
passes it through as `UncheckedAccount` (txoracle self-constrains it — M0 fail-a).

The crank supplies proof args from `GET /api/scores/stat-validation` mapped via the
vendored `buildScoresBatchSummary` / `buildStatTerm` / `toProofNodes` (remember the
`eventStatsSubTreeRoot → eventsSubTreeRoot` remap and signed→unsigned byte fix).

---

## Payout math (integer-safe)

`payout = user_stake * total_pool / winning_total` using u128 intermediates:
```rust
let payout = ((user_stake as u128) * (total_pool as u128) / (winning_total as u128)) as u64;
```
Truncates toward zero; residual dust (< 1 unit per claimer) stays in the vault
(acceptable for devnet). Unopposed prop (one side 0 stake) ⇒ `Refundable`, everyone
gets their exact stake back.

---

## Safety
- No admin key, no drain path. Funds leave only via `claim` (winner, pro-rata),
  `refund` (unopposed), or `close_prop` (empty vault → creator).
- `settle` idempotent via `status` state machine; can't settle twice; can't settle
  before a valid proof (CPI is the gate).
- `//! UNAUDITED — devnet/testnet-value only` header on the program.

---

## Integration test plan (devnet, `anchor test`)
1. Happy path: create → 2 users join opposite sides → `settle` via real CPI (reuse
   the M0 fixture/proof) → winner `claim`, loser rejected, vault ends ~0.
2. Unopposed: single-side prop → `settle` sets Refundable → `refund` returns stakes.
3. Guards: double-`settle` → error; `settle` with corrupted proof → 6004 revert,
   stays Open; wrong `ts`/bucket → 2006/6010 revert; `join` after deadline → error.

---

## Risks / to verify during M1
- **Transaction size, not CU.** Proof arrays (subTreeProof depth ~7 in M0) + summary
  + stat terms are large; deep trees could approach the 1232-byte tx limit. Mitigate
  with a compute-budget-only preinstruction (small) and, if needed, address-lookup
  tables. Measure with the real M0 proof first.
- Confirm `declare_program!` codegen matches the v1.5.5 IDL enums/Option encodings;
  otherwise fall back to manual CPI.
- Devnet USDC: use a controlled test SPL mint (6 decimals) if a canonical devnet
  USDC isn't convenient; keep the mint configurable (never hardcode mainnet USDC).
