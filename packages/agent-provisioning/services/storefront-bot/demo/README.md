# Demo: payment → running agent

End-to-end demo of the paid provisioning flow, runnable fully locally. It
performs a **real on-chain SPL transfer** against a local
`solana-test-validator` (a demo mint stands in for USDC — devnet's RPC faucet
is closed), proves the verification fail-closed paths, then provisions an
agent and shows it responding on its dashboard port. It finishes by driving
the Telegram wizard over the local webhook and asserting OpenRouter/Kimi API
keys land **encrypted** in `wizard_state`.

## Run

```bash
cd packages/agent-provisioning
npm install
bash services/storefront-bot/demo/run-demo.sh
```

Requires `solana-test-validator` on PATH (or `SOLANA_TEST_VALIDATOR`) when
`SOLANA_RPC_URL` is unset — the runner starts one on `DEMO_RPC_PORT`
(default 18899) with its own ledger under `.demo/`.

What it shows:

1. `POST /api/v1/auth/email-signup` → `solana-pay-qr` creates a $9 payment.
2. Verification **fails closed**: malformed signature (`400`), well-formed
   but non-existent transaction (`400`), on-chain underpayment (`402`),
   correct amount to the wrong wallet (`402`), unauthenticated call (`401`).
   RPC errors return `502` and never upgrade. No confirmed transfer of the
   right mint to the platform wallet → no upgrade.
3. A real transfer of $9 in the demo mint is verified by the transaction's
   token-balance delta to the platform wallet → `pro`.
4. `POST /api/v1/agents` provisions a tenant (demo mode writes
   `openclaw.json` + secret files to `./.demo/tenants` instead of SSH, and
   stubs `docker run` with a local HTTP listener).
5. `GET /api/v1/agents/:id/status` reports `running`; the demo curls the
   dashboard port and gets `demo-agent-ok`.
6. The Telegram wizard is driven over `/telegram/webhook` with fake updates;
   `openrouterApiKey` / `kimiApiKey` must end up `enc:`-prefixed
   (AES-256-GCM) in `wizard_state.data_json`.
7. Evidence at the end: `chmod 600` secret files on disk and only
   `enc:`-prefixed values in sqlite.

## Env

| var | purpose |
|---|---|
| `HFSP_DEMO_PROVISION_DIR` | set → `sshTenant` runs locally under this dir and docker is stubbed |
| `SOLANA_USDC_MINT` | mint payments verify against (default: mainnet USDC) |
| `SOLANA_WALLET_ADDRESS` | platform wallet receiving payment |
| `SOLANA_RPC_URL` | RPC endpoint; unset → local `solana-test-validator` |
| `DEMO_RPC_PORT` | local validator RPC port (default 18899; ws on +1, faucet on +2) |
| `DEMO_PAYER_SECRET` | base58/JSON secret key of a funded payer — required on real devnet |
| `DB_PATH`, `HFSP_DB_SECRET`, `PORT` | server config |

## Not covered

Pairing the Telegram bot (`awaiting_pairing` → `running`) needs a real bot
token; the demo stops at the provisioned-and-listening stage.
