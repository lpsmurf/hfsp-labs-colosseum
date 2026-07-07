# PropPool

Telegram-native **parametric prop-bet pools** that auto-settle from **real TxLINE
on-chain proofs** — a permissionless escrow that CPIs into the deployed TxODDS
`txoracle` program's `validate_stat` to confirm soccer-stat outcomes trustlessly,
then pays out winners.

> Target: Superteam Earn "Prediction Markets and Settlement" (TxODDS, World Cup track).
> **Devnet only. UNAUDITED. Stakes in USDC/SOL — never the TxL token.**

## Status

| Milestone | What | Status |
|---|---|---|
| **M0** | One real `validate_stat` verified on devnet + `PROOF_NOTES.md` | ✅ **GREEN** |
| **M1** | `prop_pool` Anchor consumer program (create/join/settle-via-CPI/claim/refund) | ✅ **GREEN** — deployed + devnet integration test passing |
| **M2** | Settlement crank worker | ✅ **GREEN** — settles real props unattended on devnet |
| M3 | Telegram bot + Mini App | designed (`docs/OFFCHAIN-DESIGN.md`) |

**M1 deployed:** `prop_pool` program `2APUBCYx5dnPdWpcLB3HMaAhgMM1Vj7ihCCGrhogkZrD`
(devnet). Test: create_prop → 2 users join opposite sides → `settle` (real CPI into
`txoracle::validate_stat`) → winner claims full pool, loser rejected, vault → 0, plus
double-settle guard. Toolchain: Anchor 1.1.2 / Solana 4.0.2 (Agave).

M0 proof (Brazil vs Norway, devnet): real `validate_stat` tx
[`RWmDw6WE…ft3yRdyB`](https://explorer.solana.com/tx/RWmDw6WEzbMUYfwqy1qvpU4UVDgh8FcuzpLqXitsMdJCaM4AthKwa25h1awSfe6bgGwnpgs8DdFUBq9ft3yRdyB?cluster=devnet).

## Layout
```
src/txline/        Vendored TxLINE SDK (auth, subscribe, proof fetch, validate) — see VENDORED.md
scripts/           setup-wallet.ts (devnet keypair + airdrop), m0-validate-stat.ts (the proof)
txoracle-idl/      Real txoracle IDL v1.5.5 (github.com/txodds/tx-on-chain)
PROOF_NOTES.md     Source-cited proof internals + verified live results (the M0 deliverable)
docs/              M1 program design, off-chain design, competitor/bounty brief
artifacts/         M0 run artifacts (gitignored)
```

## Run Milestone 0
```bash
npm install
npm run wallet          # generate a devnet keypair (.devnet-wallet.json, gitignored) + airdrop
#   if the faucet is rate-limited, fund the printed address at https://faucet.solana.com
npm run m0              # auth → subscribe → activate → fetch proof → validate_stat (real tx) → reproduce 6004
```
Requires ~0.05 devnet SOL. No secrets are committed; the wallet file and TxLINE
token cache are gitignored.

## Build & test the program (M1)
```bash
anchor build
anchor deploy --provider.cluster devnet --provider.wallet .devnet-wallet.json
npx tsx tests/prop-pool.test.ts     # full flow against live devnet + real txoracle CPI
```
Needs the Anchor toolchain (Rust + Solana CLI + `avm use 1.1.2`) and a funded devnet
wallet (~3 SOL for deploy + test).

## Settlement crank (M2)
```bash
npx tsx crank/seed-demo-prop.ts   # create an OPEN prop + two joins (no settle)
npm run crank -- --once           # single pass: settles any ready prop, logs the proof tx
npm run crank                     # continuous poll loop (settles props past settle_after)
```
The crank reuses the vendored TxLINE auth, resolves each prop's root bucket, fetches
the proof, and submits `settle()` (idempotent; retries transient RPC errors).

txoracle (oracle, devnet): `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` ·
prop_pool (ours, devnet): `2APUBCYx5dnPdWpcLB3HMaAhgMM1Vj7ihCCGrhogkZrD` ·
API origin: `https://txline-dev.txodds.com`
