# TxODDS outreach — t.me/TxLINEChat

Goal of the first message: confirm bounty scope + judging, and get pointed at
the **devnet** subscribe path so we can pull real World Cup data. Keep it short,
show we already understand their Solana-native model (that's the credibility hook),
ask 3 concrete questions, get out.

---

## Message 1 — opener (send this)

> Hi TxLINE team 👋 We're building for the World Cup hackathon on Superteam Earn —
> targeting the **Prediction Markets & Settlement** and **Trading Tools & Agents**
> bounties.
>
> We're a Solana/x402 team, so TxLine being on-chain-subscription native is a
> perfect fit. We've already got a working edge engine (sharp odds vs Polymarket,
> de-vig + Kelly + CLV) and we want to drive it off **your** feed, plus build an
> **on-chain settlement oracle** that verifies your score Merkle proofs to resolve
> markets trustlessly.
>
> Three quick questions to start:
> 1. Can you confirm the **devnet** subscribe flow for the free World Cup tier?
>    We have the program ID `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` and
>    mint `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` — is there a published
>    **Anchor IDL** we can pull (the `/documentation/programs/devnet` link)?
> 2. For the **score Merkle proofs** — is there a doc/example of the proof format
>    and the root we verify against on-chain? That's central to our settlement build.
> 3. Any judging guidance you can share beyond the listing (what a winning
>    submission looks like to you)?
>
> Happy to share our repo/demo as we go. Thanks! 🙏

---

## Follow-ups (hold until they reply)

- **If they share the IDL:** "Perfect — we'll wire `subscribe(service_level_id=1,
  weeks=N)` and report back with a fixtures dump. Is service level 1 (60s delay)
  fine for judging, or do you prefer level 12 (real-time) demos?"
- **If they ask what we've built:** link the edge engine
  (`packages/x402-polymarket-edge`) — de-vig, fractional Kelly, fail-closed
  matcher, CLV-validated paper trading — and the settlement-oracle design
  (`worldcup-bounty/settlement-oracle/DESIGN.md`).
- **If Merkle format is undocumented:** "Could you point us at a sample signed
  score payload + proof? We'll adapt our verifier to whatever hash/ordering you
  use (we're assuming sorted-pair keccak unless told otherwise)."
- **If they gate access:** ask the minimal path to a working API token for a
  hackathon team (devnet subscribe vs. a sandbox token).

## Tone notes
- Lead with the on-chain-native observation — it signals we read past the listing.
- Name the exact program ID/mint so they know we've already done the homework.
- Ask for the IDL + the Merkle proof format; those two unblock everything.
- Don't over-promise scope; "targeting two bounties" reads as focused, not greedy.
