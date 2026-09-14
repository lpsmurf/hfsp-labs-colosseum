# subscriptions program audit — solana-foundation/subscriptions

**Audit date:** 2026-09-08 · **Auditor:** HFSP Labs (independent) · info@hfsp.xyz
**Target:** [solana-foundation/subscriptions](https://github.com/solana-foundation/subscriptions) @ `8830ba7` (`main` tip)
**Result:** **No high/critical findings** in the audited paths. Safe to describe in full — no embargo.

The on-chain **Pinocchio native** Solana program (no Anchor — every owner/signer/PDA check is
manual) that executes recurring/one-time delegated pulls. The account type pay-kit's KIT-04
decoder targets.

## Findings
None. The recurring-pull money path was traced end to end; six hypothesized attacks were all
blocked:

| Attack hypothesis | Defense present |
|---|---|
| Anyone triggers a pull | delegatee **must sign** (`SignerAccount::check`) |
| Forged delegation account | `ProgramAccount::check` → `owned_by(&crate::ID)` |
| Fake subscription authority | `SubscriptionAuthorityAccount::check`; authority bound to `(user, mint)` |
| Pull from another subscriber's ATA | token-account owner check + ATA re-derivation |
| Over-pull within a period | `amount_per_period − amount_pulled` cap, checked arithmetic |
| Forge events / overflow | event authority is a program PDA (self-CPI only); all math checked |

Spot-checked clean: `emit_event` (PDA-signer gated), `transfer_fixed_delegation` (decrementing
balance, no replay), `update_plan` (owner signer + program-account checks).

## Assessment
Across the stack audited this week, the on-chain program is the **most rigorously written
component** — a sharp contrast with the CI/tooling layer. The manual native checks that usually
get skipped are all present on the money path.

## Limits
Source review only; no build/test, local validator, or on-chain execution. 8 of 24 instructions
read in depth (the money-movement + auth paths); `revoke_abandoned_*` (account-closing/rent) and
`create_*`/`subscribe` were not fully verified. Absence of findings here is not certification of
the whole program.
