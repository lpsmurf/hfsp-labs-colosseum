# Devin handoff — TxODDS "Prediction Markets and Settlement" bounty

Copy everything below into Devin as the task prompt.

---

## Context

Repo: `hfsp-labs-colosseum` monorepo. We're building a submission for the Superteam Earn
listing **"Prediction Markets and Settlement"** (sponsor: TxODDS, $18,000 USDT — 12k/4k/2k,
World Cup Track, listing slug `prediction-markets-and-settlement`, hackathon id shows deadline
**2026-07-19** — confirm the live date on https://superteam.fun/earn/listing/prediction-markets-and-settlement
before you start, dates may have been re-synced). Judging criteria (from the listing): core
functionality against live/simulated TxLINE data, UX for a compelling use case, code quality.

**Step 0 — fix the branch situation first.** Our prior work on this bounty landed on
`feat/wdk-solana-defi-module-v2`, NOT on `main` or whatever branch is currently checked out.
Run `git log --oneline --all -- packages/worldcup-bounty` to confirm, then bring
`packages/worldcup-bounty/` onto a clean branch off `main` (cherry-pick or merge — your call,
just don't lose the history). Relevant commits: `592408d` (scaffold + outreach draft),
`54934c6` (solana-ai-kit rust/anchor rule conformance fixes). Also check
`packages/x402-polymarket-edge/` (commits `e6ed748`, `fb38a74`) — a de-vig/Kelly edge-pricing
engine that's a candidate differentiator to bolt on later, lower priority than the core rework.

## The critical architectural correction

Our existing `packages/worldcup-bounty/settlement-oracle/` (Anchor program: `OracleConfig` /
`RootCommitment` / `Resolution` PDAs, `initialize` / `commit_root` / `resolve` instructions)
**reimplements an oracle that TxODDS already runs.** This is the wrong architecture. Throw out
the root-commitment half of that design; keep the "trustless settlement consumer" framing.

**Ground truth** (verified via TxODDS's own public repo, `github.com/txodds/tx-on-chain`):

- Live deployed program `txoracle`, IDL at `idl/txoracle.json` in that repo.
  - Devnet program ID: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
  - Mainnet program ID: `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`
  - Devnet TxL mint: `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` / Mainnet: `Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL`
  - Devnet USDT mint: `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` / Mainnet: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
  - **Devnet API origin is `https://txline-dev.txodds.com`** — the sponsor's own shipped examples
    point at a dead host (`oracle-dev.txodds.com`); don't waste time on that one.
- TxODDS's own program already does root commitment (`insert_scores_root`, `insert_fixtures_root`,
  `insert_batch_root`) and already exposes CPI-able verification + predicate evaluation:
  `validate_fixture`, `validate_odds`, `validate_stat`, `validate_stat_v2`.
- **`validate_stat` evaluates a threshold predicate on-chain**, not a raw equality check. Its args
  (from the IDL): `ts: i64`, `fixture_summary: ScoresBatchSummary`, `fixture_proof: Vec<ProofNode>`,
  `main_tree_proof: Vec<ProofNode>`, `predicate: TraderPredicate`, `stat_a: StatTerm`,
  `stat_b: Option<StatTerm>`, `op: Option<BinaryExpression>`. Pull the full struct defs for
  `ScoresBatchSummary`, `ProofNode`, `TraderPredicate`, `StatTerm`, `BinaryExpression` straight out
  of `idl/txoracle.json` — don't guess the shapes.
- **Soccer stat-key encoding** (not in TxODDS's public docs, which only table US Football/Basketball
  — this was reverse-engineered by a competitor and is correct, confirmed against their
  `docs.yaml` v1.5.2): base keys `P1_GOALS=1, P2_GOALS=2, P1_YELLOW=3, P2_YELLOW=4, P1_RED=5,
  P2_RED=6, P1_CORNERS=7, P2_CORNERS=8`; period offset added on top: `FULL_GAME=+0, H1=+1000,
  H2=+2000, ET1=+3000, ET2=+4000, PENALTIES=+5000`. E.g. `P1_GOALS` in the 2nd half = `2002`.
  Verify this yourself against `GET /api/scores/stat-validation` on the live devnet API before
  betting the whole design on it — it's second-hand, not from TxODDS docs directly.
- **Odds only have batch-level membership proofs** (`validate_odds`) — there is no per-stat
  threshold predicate for odds the way there is for scores. Don't design an odds-threshold CPI.
- **Known live gotcha #1**: `subscribe(service_level_id, weeks)` — `weeks` must be a multiple of
  4, minimum 4. The examples showing `weeks=1` get rejected on-chain.
- **Known live gotcha #2**: at least one careful, technically competent public competitor
  (`Faadil1/settlement-sentinel` on GitHub) is currently stuck calling `validate_stat` for real —
  it reaches the deployed program but fails with Anchor custom error `6004 InvalidMainTreeProof`
  ("summary does not belong to the on-chain root"). Budget real time for proof construction —
  this is evidently the hard part, not a formality. Read their repo's writeup for what they tried.

## What "done" looks like, in priority order

1. **Get one real `validate_stat` (or `validate_fixture`) call to succeed on devnet**, end to end:
   fetch a live fixture from TxLINE's API, request the matching proof
   (`GET /api/scores/stat-validation` or the fixtures/odds equivalents — check
   `txline.txodds.com/documentation/examples/onchain-validation` for the canonical example), submit
   the CPI, get a passing result back. This alone is a differentiator — most public competitors
   are still stuck at scaffold/simulated/read-only stage on exactly this step.
2. Rewrite `packages/worldcup-bounty/settlement-oracle/` as the **consumer**: a small Anchor
   program that holds user funds (SOL or USDC) in a market/pool PDA, and on settlement, CPIs into
   the real `txoracle` program's `validate_stat`/`validate_fixture` to confirm the outcome
   trustlessly, then releases funds. Keep `verify.ts`'s off-chain Merkle logic only if it's still
   useful for local testing against fixtures you control — don't ship it as the trust root, TxODDS's
   on-chain root is the trust root.
3. Update `packages/worldcup-bounty/txline-client.ts` (guest-session code is already confirmed live)
   to also drive the real `subscribe()` call on devnet with a funded wallet, and wire the corrected
   API origin / weeks-multiple-of-4 constraint.
4. Pick one concrete product wrapper rather than staying abstract — a simple parimutuel or
   fixed-odds binary market ("home win / draw / away win", or a total-goals over/under) tied to one
   real World Cup fixture is enough for judging; don't over-scope. A basic Next.js or even a CLI
   demo showing: create market → deposit → match ends → anyone triggers settle → CPI succeeds →
   winners claim, is the core deliverable.
5. Resolve or explicitly send `packages/worldcup-bounty/telegram-message.txt` /
   `TELEGRAM-OUTREACH.md` (drafted, never confirmed sent) to TxODDS's Telegram
   (`https://t.me/TxLINEChat`) if you hit a real integration blocker — flag it back to the user
   rather than silently waiting, we're on a 2-week clock.

## Constraints / don't-do's

- Don't rebuild the root-commitment side of the oracle — that's TxODDS's program, not ours.
- Don't spend time on the P2P TxL-token wagering angle — the bounty brief explicitly forbids using
  the TxL credit token for P2P staking/wagering/wallet transfers; settlement pools must use SOL or
  USDC, not TxL.
- Devnet only until the core flow works. Don't touch mainnet program IDs / real funds.
- If `anchor build`/`anchor deploy` tooling isn't available in your sandbox, say so early rather
  than late — that's a hard blocker for step 1/2.

## Report back

When you've got `validate_stat` (or `validate_fixture`) passing for real on devnet, or if you hit a
wall (e.g. reproduce the same `InvalidMainTreeProof` error), report the exact proof construction
you used (leaf bytes, proof array, which endpoint served it) so we can compare notes — that's the
single highest-value piece of information for this submission either way.
