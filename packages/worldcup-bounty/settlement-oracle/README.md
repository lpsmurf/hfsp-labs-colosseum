# Settlement Oracle

Resolves prediction markets from **TxLine score Merkle proofs** — the differentiator
for the World Cup "Prediction Markets & **Settlement**" bounty. A TxODDS signer
commits a Merkle root of finalised scores; then anyone can permissionlessly prove a
fixture's result against that root and resolve it on-chain. Liars fail the proof and
the tx reverts.

See [`DESIGN.md`](DESIGN.md) for the trust model, PDAs, and instruction specs.

## Layout
```
DESIGN.md                              trust model + accounts + leaf format
verify.ts                              reference Merkle verifier (off-chain, runnable today)
Anchor.toml / Cargo.toml               Anchor workspace
programs/settlement-oracle/src/lib.rs  the on-chain program (initialize/commit_root/resolve)
```

## Try the verifier now (no chain needed)
```bash
npm run verify        # from worldcup-bounty/
```
Builds a Merkle tree from sample scores, proves each fixture, and asserts that a
flipped outcome and a garbage proof are both rejected. `verify.ts` hashing matches
`lib.rs` byte-for-byte (keccak256 leaves, sorted-pair fold), so what passes here is
what the program accepts.

## Build + deploy the program (needs Solana + Anchor on the machine)
```bash
cd settlement-oracle
anchor build
anchor keys sync          # writes the real program id into lib.rs + Anchor.toml
anchor deploy --provider.cluster devnet
```

## Open item before mainnet
Confirm TxODDS's exact **leaf encoding** + fold order (Telegram Q2 in
`../TELEGRAM-OUTREACH.md`). Today's default is borsh-LE leaf
`(fixtureId:u64, outcome:u8, scoreHome:u16, scoreAway:u16)` → keccak256, folded
OZ-style. If TxODDS differs, change `buildLeaf` (verify.ts) + `leaf_hash` (lib.rs)
together and re-run `npm run verify`.
