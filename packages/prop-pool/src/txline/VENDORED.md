# Vendored: `txline-anchor`

This directory is a vendored copy of the community reference SDK
[`github.com/unnamed-lab/txline-anchor`](https://github.com/unnamed-lab/txline-anchor)
(MIT licensed), which reverse-engineered and verified the TxODDS `txoracle`
on-chain proof-validation flow against live devnet on 2026-07-01.

We vendor rather than depend on it because it is not published to npm, and this
is the trust-critical primitive PropPool builds on (auth → subscribe → activate →
fetch stat proof → `validate_stat` CPI). PropPool's settlement path reuses these
exact leaf/proof/PDA constructions.

## What we use it for
- `auth.ts`, `subscribe.ts`, `client.ts`, `data.ts` — TxLINE off-chain API flow.
- `pdas.ts` — `daily_scores_roots` PDA derivation (seed: `"daily_scores_roots"` +
  `epochDay(le,2)`, where `epochDay = floor(tsMs / 86_400_000)`).
- `validate.ts` — builds the directional Merkle proof (`ProofNode.isRightSibling`)
  and calls `validate_stat`, reading the predicate result from program return data.

## Local notes / deltas
- The bundled IDL here is v1.4.7. The authoritative, newer IDL we pulled from
  `txodds/tx-on-chain` (v1.5.5) lives at `packages/prop-pool/txoracle-idl/txoracle.json`
  and is what the PropPool on-chain program's CPI targets. `validate_stat`'s
  signature is identical across both versions.
- Correct devnet API origin is `https://txline-dev.txodds.com` (the sponsor's
  older shipped examples point at the dead `oracle-dev.txodds.com`).

MIT © the txline-anchor authors. See the upstream repository for full license text.
