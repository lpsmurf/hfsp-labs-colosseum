# Settlement Oracle — design

**What it is:** a Solana program that takes a TxLine score + its Merkle proof and
**resolves a prediction market on-chain, trustlessly**. No human referee decides
who won — the chain verifies TxODDS's own signed data and posts the result. This
is the differentiator for Bounty 1 (Prediction Markets & **Settlement**): the
title's second word, and the part almost no other team will build.

---

## The trust chain (why this is "trustless")

```
TxODDS publishes a signed Merkle root for a batch of final scores
        │  (root committed by an authorised TxODDS oracle key)
        ▼
On-chain: store the root  ──►  RootCommitment PDA  (seed: ["root", batch_id])
        │
        ▼
Anyone submits:  (fixtureId, outcome, leaf, proof[])
        │
        ▼
Program verifies:  keccak-folded proof  ==  stored root   ──►  if yes, write Resolution PDA
        │
        ▼
Markets read the Resolution PDA to pay out.  No oracle discretion at settlement time.
```

The only trusted action is TxODDS committing a root. Everything after is pure
verification — a settler who lies fails the proof check and the tx reverts.

## Accounts (PDAs)

| PDA | Seeds | Holds |
|---|---|---|
| `OracleConfig` | `["config"]` | admin pubkey, the TxODDS root-signer pubkey, batch count |
| `RootCommitment` | `["root", batch_id: u64]` | `merkle_root: [u8;32]`, `committed_at`, `committer` |
| `Resolution` | `["res", fixture_id: u64]` | `outcome: u8` (0 home / 1 draw / 2 away), `score_home`, `score_away`, `batch_id`, `resolved_at` |

## Instructions

1. `initialize(txodds_signer: Pubkey)` — set admin + the authorised TxODDS root key. Once.
2. `commit_root(batch_id: u64, merkle_root: [u8;32])` — **only the TxODDS signer.**
   Stores the root for a batch of finalised scores.
3. `resolve(fixture_id: u64, outcome: u8, score_home: u16, score_away: u16, batch_id: u64, proof: Vec<[u8;32]>)`
   — anyone (permissionless). Rebuilds the leaf, folds the proof, checks it equals
   the committed root for `batch_id`. On success writes the `Resolution` PDA.
   On mismatch: `err!(InvalidProof)` and the tx reverts — no bad settlement possible.

## Leaf format (must match TxODDS's hashing — confirm via Telegram)

```
leaf = keccak256( borsh( fixture_id:u64 ‖ outcome:u8 ‖ score_home:u16 ‖ score_away:u16 ) )
```

Proof folding uses **sorted-pair keccak** (OpenZeppelin-style) so leaf ordering
doesn't matter:

```
parent = keccak256( min(a,b) ‖ max(a,b) )
```

> ⚠️ The exact leaf encoding + fold order are the **one thing we must confirm with
> TxODDS** (Telegram question #2). The verifier below is parameterised so we swap
> the encoding without touching the program structure. Until confirmed, this is the
> sensible default (sorted-pair keccak, borsh leaf).

## How a market uses it

A separate (or third-party) prediction market does a CPI / account read of the
`Resolution` PDA for its `fixture_id`. If present and `outcome` matches the bet,
it pays. The oracle stays generic — it resolves *facts about matches*, not bets,
so any market (ours, Polymarket-style, a fan game) can consume it.

## Build order

1. `verify.ts` (this folder) — reference Merkle verifier + leaf builder, runs off-chain
   today so we can unit-test against a TxODDS sample the moment we get one.
2. `lib.rs` — Anchor program mirroring the same hashing (keccak via `solana_program::keccak`).
3. Devnet deploy + an integration test: commit a root from a known leaf set,
   resolve one fixture, assert the `Resolution` PDA, assert a tampered proof reverts.
4. Swap leaf encoding to TxODDS's real format once confirmed.

## Why it wins
- It's the literal bounty title and uses TxODDS's **own** Merkle proofs — the
  feature they built that nobody else will touch.
- Permissionless settlement = trustless = the on-chain story judges want.
- Generic resolver → reusable across all three bounties (markets, agent, fan game).
