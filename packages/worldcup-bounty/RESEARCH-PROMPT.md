# Research prompt — TxODDS "Prediction Markets and Settlement" bounty ideation

Copy everything below into a fresh Claude session (new context, no prior memory of this project)
as a research task. This is research/ideation only — do not write implementation code; a separate
engineering effort (Devin) is handling the build. Budget: go deep, this can take a while.

---

## Background

I'm competing in a Superteam Earn hackathon bounty: **"Prediction Markets and Settlement"**,
sponsored by TxODDS (their product is "TxLINE" — real-time sports data + odds, cryptographically
anchored on Solana via Merkle roots). $18,000 USDT prize pool, World Cup Track, deadline around
2026-07-19 (confirm the live date at
https://superteam.fun/earn/listing/prediction-markets-and-settlement — fetch
`https://earn.superteam.fun/api/listings/details/prediction-markets-and-settlement` for the
structured JSON, it has the full bounty description, deadline, and judging criteria fields).

TxODDS already runs a live, deployed on-chain Solana program called `txoracle`
(devnet `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, mainnet
`9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`) that anchors Merkle roots for fixtures/odds/scores
and exposes CPI-able instructions (`validate_fixture`, `validate_odds`, `validate_stat`,
`validate_stat_v2`) that verify a Merkle proof AND evaluate an on-chain predicate. Their own
documentation/IDL repo is public: `github.com/txodds/tx-on-chain`. The bounty is asking teams to
build products that CPI into this existing oracle — not to build an oracle from scratch.

I already know a lot of the surface-level competitive landscape (I found ~10 public GitHub repos
building for this exact track, and read their READMEs). What I need from you is **deeper** research
in two directions:

## Direction 1 — Proof-construction internals (technical depth)

Several public competitor teams (e.g. a repo called `settlement-sentinel` by `Faadil1` on GitHub)
report getting stuck calling `validate_stat` with a real Anchor error `6004 InvalidMainTreeProof`
("the summary does not belong to the on-chain root"). This is evidently the hard, unsolved part of
this bounty for most teams. Please:

1. Pull `github.com/txodds/tx-on-chain`'s `idl/txoracle.json` and fully read the account/type
   definitions for `ScoresBatchSummary`, `ProofNode`, `TraderPredicate`, `StatTerm`,
   `BinaryExpression`, `NDimensionalStrategy`, and the PDA seeds used by `insert_scores_root` /
   `insert_fixtures_root` / `insert_batch_root` (look at the `accounts` array per instruction, not
   just `args`).
2. Read TxODDS's hosted docs at `https://txline.txodds.com/documentation/examples/onchain-validation`
   and the OpenAPI spec at `https://txline.txodds.com/docs/docs.yaml` for the canonical
   request/response shape of whatever off-chain endpoint serves the proof
   (`GET /api/scores/stat-validation` or similar) — the goal is to nail down exactly which bytes go
   into the leaf, what order the two-level proof (`fixture_proof` vs `main_tree_proof`) folds in,
   and how batch identity (`epoch_day`/`hour_of_day`/`minute_of_hour`) maps to which on-chain root
   account a given stat needs to be checked against. A batch/root mismatch (checking against the
   wrong `epoch_day`/`hour`/`minute` bucket) is the most likely cause of `InvalidMainTreeProof`
   errors like the one `settlement-sentinel` hit — confirm or rule this out.
3. Read `github.com/unnamed-lab/txline-anchor`'s full source (not just the README) — it's a shared
   SDK wrapping this exact primitive, reverse-engineered soccer stat keys (base stat 1-8 × period
   multiplier), and documents several corrections to TxODDS's own shipped examples (dead devnet API
   host, wrong mint address, `subscribe` weeks must be a multiple of 4). Extract anything else it
   documents about proof construction, especially around `validate.ts` / `pdas.ts` in that repo.
4. If you can find any other public repo (GitHub search, or via web search for
   "TxLINE validate_stat" / "InvalidMainTreeProof" / "txoracle proof") that has gotten a *passing*
   `validate_stat` or `validate_fixture` call, extract exactly what proof shape worked.

Report back: the exact byte layout of a scores-stat leaf, the exact fold/ordering algorithm for
the two-level proof, and the exact account/PDA set a `validate_stat` call needs, in enough detail
that an engineer could implement it without further guessing.

## Direction 2 — Differentiation / product ideas (creative depth)

I already know the obvious product shapes are taken by public competitors: parimutuel binary
markets (home/draw/away), friend-group betting pools, sub-minute micro-markets on odds/corners/
cards, a "settlement auditor with bonded disputes" watchdog layer, and a challenge-window fix for
the fact that TxLINE has no explicit cryptographic signal for "this match has ended." I need ideas
that go beyond this set. Please research and propose:

1. Read the bounty's full "Ideas to get started" section (in the API JSON from the URL above —
   it lists 5 official suggestions: Full-Tournament Auto-Market, Verifiable Resolution UI,
   Prediction Market Viewer, Decentralized Prediction Markets & AMMs, Parametric Sports Insurance &
   Prop Bets) and the judging criteria, and identify which of the 5 official ideas look
   **least** covered by the public competitor repos I'll list below (so you're not proposing
   something 6 teams already built).
2. Cross-reference against the "Trading Tools and Agents" sister bounty
   (`https://superteam.fun/earn/listing/trading-tools-and-agents`, same sponsor, same data feed,
   $16k) — is there a product idea that legitimately spans both tracks (e.g. an
   edge-detection/pricing layer feeding into a settlement product) that would be defensible as a
   single coherent submission rather than diluted across two categories?
3. Specifically research the "Parametric Sports Insurance & Prop Bets" official idea (PDA-locked
   collateral released automatically on a verified TxLINE proof, e.g. "Team A corners + Team B
   corners > 10") — this seems to be the least-built idea among public competitors (most did
   simple win/draw/lose or totals markets). Propose 2-3 concrete, narrow, buildable-in-under-two-
   weeks product specs in this space, each with: the exact predicate it'd CPI-check via
   `validate_stat`, who the target user is, and why it's compelling for judges (per the listed
   judging criteria: core functionality against live data, UX/use-case, code quality).
4. Also specifically evaluate the "Verifiable Resolution UI" official idea combined with something
   TxODDS's own docs emphasize — the tamper-evident audit trail / "receipt" framing — is there a
   compelling angle where the product's main value is the *proof itself* being portable/embeddable
   (e.g. a widget/API other prediction markets could embed to show "this outcome is TxLINE-proven"
   rather than building yet another full betting product)?
5. Sanity-check feasibility against the 2-week timeline and against constraints already confirmed:
   the TxL credit token cannot be used for P2P wagering (bounty rule), soccer stat-key encoding
   only supports 8 base stats (goals/yellow/red/corners) with period granularity down to
   half/extra-time/penalties — no finer than that is currently known to be exposed.

Report back: 3-5 concrete product concepts ranked by (a) how differentiated they are from the
public competitor field, (b) buildability in the remaining time, (c) fit to stated judging
criteria — with enough specificity (exact predicate/data used, exact user flow) that I could hand
the winning one straight to an engineer.
