# PropPool — Demo Walkthrough

**One line:** Telegram-native parametric prop-bet pools that **auto-settle from real
TxLINE on-chain proofs** — a permissionless escrow that CPIs into TxODDS's deployed
`txoracle::validate_stat` to confirm soccer-stat outcomes trustlessly, then pays winners.

**Bounty:** Superteam Earn — *Prediction Markets and Settlement* (TxODDS, World Cup).
**Network:** Solana devnet · **Stakes:** USDC · **UNAUDITED, devnet only.** TxL is never
in the money path.

---

## Live end-to-end run (reproducible: `npm run demo:e2e`)

A real run against **live devnet + the real `txoracle`** — every step is an on-chain tx:

| Step | What happened |
|---|---|
| Match / stat | **USA vs Belgium**, *Home Goals* — value anchored on-chain by TxLINE = **1** |
| ① Create | Alice creates prop **"Home Goals over 0"** → [tx](https://explorer.solana.com/tx/5m61pkgeBFMQN4VcxB81pG2ug6XMGtXF1HpwXMBHzoc14JbgaFmpyDW9y3AMP36c9ijj9CrSLr9Jpnd5vgSGtMie?cluster=devnet) |
| ② Stake OVER | Alice stakes 1 USDC OVER → [tx](https://explorer.solana.com/tx/5zycg4GyeXnc2kUNQbCxfz7t5We9SXRW5Qpxu3iHbWiuUGRXMYWrf7ucfRg6qweyqzwUgqUA71CuYG7cwnWUfNgy?cluster=devnet) |
| ③ Stake UNDER | Bob stakes 2 USDC UNDER → [tx](https://explorer.solana.com/tx/2K5y5wnFxg8VnTQWyH6Q4Z5NDkQFUxAh3evhGFb7ntwHVmDmdJEV76s4CjS4L2d5jEKB8SrhYwFnHoBYdQNwerU2?cluster=devnet) |
| ④ **Settle (crank)** | Crank CPIs into **`txoracle::validate_stat`** — proof verified, `1 > 0` ⇒ OVER wins → [tx](https://explorer.solana.com/tx/5qeda47xKLXcEdj5Be9MDkvVceN6F2pyYHTPQaxCg6wFL7mfTp94C9JEob6wtohQzNSCmVNKz83qr349AqzaQANs?cluster=devnet) |
| ⑤ Claim | Alice (winner) claims the full 3 USDC pool; vault → 0 → [tx](https://explorer.solana.com/tx/31sNBHTHMNzWv8U9YEfekZwTNr72654fzBfCtvjX6ZJcgcHYsn7t576s26sxMiaT9HTXNUJEroVWEJdqTfr6DGey?cluster=devnet) |

Prop account: `DiTJYyK6CuTMXNc26z1CLp9ThheTn25juPZswRQyPTbZ` ·
prop_pool program: `2APUBCYx5dnPdWpcLB3HMaAhgMM1Vj7ihCCGrhogkZrD`
(latest run data in `artifacts/demo-run.json`; a bad proof reverts the whole settle tx —
see `PROOF_NOTES.md` §8 for the reproduced `6004`).

---

## Architecture

```
  Telegram bot (grammY)        Telegram Mini App (React + wallet-adapter)
   /prop  /mypools  cards        connect wallet · create / join / claim
        │  posts card  ▲                       │ signs txns
        │              │ result                ▼
        ▼              │            ┌───────────────────────────┐
  shareable prop card ─┘            │  prop_pool  (Anchor, devnet)│
                                    │  create_prop / join /       │
   Settlement crank ──────────────▶│  settle ──CPI──►┐  / claim   │
   (poll → fetch TxLINE proof →     └─────────────────┼───────────┘
    submit settle())                                  ▼
                                    ┌───────────────────────────┐
                                    │  txoracle (TxODDS, EXISTS) │
                                    │  validate_stat (Merkle+    │
                                    │  predicate, returns bool)  │
                                    └───────────────────────────┘
```

The bot holds **no keys** — all signing happens in the Mini App with the user's wallet.
We do **not** build an oracle: settlement CPIs into TxODDS's own on-chain proof verifier.

---

## Why it wins (the three judging axes)

- **Core functionality vs live data** — a *real* `validate_stat` CPI settlement on
  devnet against anchored World Cup data (most competitors stall at exactly this step;
  see the source-cited `PROOF_NOTES.md`, incl. the corrected `6004` model).
- **UX / use-case** — Telegram-native social prop bets: create in chat, friends stake in
  a wallet-connected Mini App, auto-posted "TxLINE-proven" result cards. Parametric props
  (an under-built official suggestion), not the generic "bet with friends" everyone ships.
- **Code quality** — small, auditable escrow with no admin drain path; integer-safe
  pro-rata payout; idempotent, permissionless settle; tests + a reproducible e2e demo.

---

## Reproduce it

```bash
cd packages/prop-pool
npm install
npm run wallet            # devnet keypair + airdrop (or fund via faucet.solana.com)
npm run m0                # prove one real validate_stat on devnet (Milestone 0)
anchor build && anchor deploy --provider.cluster devnet --provider.wallet .devnet-wallet.json
npm run test:program      # full integration test (create→join→settle→claim + guards)
npm run demo:e2e          # the narrated end-to-end demo above
```
Toolchain: Anchor 1.1.2 / Solana 4.0.2 (Agave). See `README.md` for the bot + Mini App.
