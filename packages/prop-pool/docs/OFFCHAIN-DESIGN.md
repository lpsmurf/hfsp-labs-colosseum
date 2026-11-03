# M2/M3 — Off-chain: settlement crank + Telegram bot + Mini App

Design for the three components that wrap the on-chain `prop_pool` core. All reuse
the vendored TxLINE SDK (`src/txline/`) proven working in M0
(`scripts/m0-validate-stat.ts`). Devnet only; stakes in USDC/SOL (never TxL).

---

## A) Settlement crank (`crank/`, Node/TS)

Generalizes the M0 script into a long-running worker that settles props unattended.

**Structure**
```
crank/
  index.ts          # main poll loop
  config.ts         # env parsing
  txline-auth.ts    # guest->subscribe->activate, cache jwt+apiToken (reuse M0 .m0-cache)
  fetch-props.ts    # load open Prop accounts via program.account.prop.all() + filters
  settle.ts         # resolve bucket, fetch proof, build args, submit settle()
  logger.ts         # pino
```

**Loop** (every `CRANK_POLL_INTERVAL_SECONDS`, default 60):
1. `program.account.prop.all()` filtered to `status == Open` and
   `now >= settle_after` (and past scheduled full-time + `CRANK_SETTLE_DELAY_MINUTES`).
2. For each: derive `daily_scores_roots` PDA from `prop.expected_epoch_day`; skip if
   the root account doesn't exist yet (not an error — retry next tick, handles the
   "no explicit match-ended signal" problem via delay + root-availability gating).
3. `getStatValidation(client, { fixtureId, seq, statKey, statKey2 })` (vendored `data.ts`).
4. Build settle args with `buildScoresBatchSummary` / `buildStatTerm` / `toProofNodes`.
5. Submit `settle()` with a `setComputeUnitLimit` preinstruction; retry/backoff on
   transient RPC errors; idempotent (skip `settled`). Log tx sig + explorer + proof link.

**Env:** `SOLANA_RPC_URL`, `CRANK_WALLET_SECRET_KEY`, `TXLINE_API_ORIGIN`
(`https://txline-dev.txodds.com`), `PROP_POOL_PROGRAM_ID`, poll/delay/retry knobs.

**Libraries:** `@coral-xyz/anchor`, `@solana/web3.js`, `axios` (already vendored),
`pino` (logging). Optional `node-cron`. Keep it a simple `setInterval` loop for the demo.

**Note:** the crank needs a `seq` per prop. Store the target `seq` (or a small range
to scan) on the `Prop` at creation, or have the crank pull the latest scored-event
seq for the fixture from `getScoresSnapshot` and pick the final one.

---

## B) Telegram bot (`bot/`, grammY)

**Commands**
- `/prop` — guided creation via inline keyboards: pick fixture → pick stat (map to
  `statKeys.ts` encoding) → operator + threshold → USDC stake + join deadline →
  confirm. Creates the `Prop` on-chain, posts a **shareable card** with a WebApp
  "Join" button (deep link into the Mini App with `?prop=<pubkey>`).
- `/mypools` — lists the user's `Position`s (open/settled) via
  `program.account.position.all([{ memcmp on user }])`.
- **Result card** — auto-posted when the crank settles: outcome + "TxLINE-proven ↗"
  link to the on-chain `validate_stat`/`settle` tx.

**Libraries:** `grammy` (+ `@grammyjs/auto-retry`), `@solana/web3.js`, `@coral-xyz/anchor`.
**State:** grammY sessions (in-memory for demo; Redis for persistence).
**User→wallet:** simplest = `/link <address>` (or read back from the Mini App after a
signed message). **Crank→bot:** Redis pub/sub `settlement_events`, or the crank calls
a small bot HTTP endpoint; bot fans out result cards to participants.

**Env:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBAPP_URL`, `SOLANA_RPC_URL`.

---

## C) Telegram Mini App (`miniapp/`, React + Vite)

Wallet connect + deposit UX inside Telegram's webview.

**Flow:** open card → connect wallet → pick side → enter USDC amount → sign the
`join` deposit tx → show pool state (per-side totals, your position).

**Critical constraint:** Telegram's in-app browser has **no injected `window.solana`**.
Use **wallet deep links** (Phantom/Solflare universal links) on mobile, with a
WalletConnect/QR fallback on desktop. Use `@telegram-apps/sdk` for WebApp lifecycle
(expand, theme, BackButton) and `initData` for the Telegram user.

**Libraries:** `react`, `vite`, `@solana/web3.js`, `@solana/wallet-adapter-react` +
`-wallets`, `@telegram-apps/sdk`, `@tanstack/react-query`. Style with Telegram theme
CSS vars for a native feel. Must be served over **HTTPS** and registered in BotFather.

**Env (VITE_*):** `SOLANA_RPC_URL`, `PROP_POOL_PROGRAM_ID`, `USDC_MINT` (devnet test mint).

---

## Cross-cutting
- Shared trust primitive: vendored `src/txline/` (auth, proof fetch, arg builders).
- Source of truth for pool state is **on-chain** (Prop/Position/vault); off-chain
  stores only Telegram↔wallet mapping + cached TxLINE auth.
- Deploy (demo): crank + bot as PM2 processes; Mini App on a static HTTPS host.
- Risk: wallet-adapter-in-Telegram is the fiddliest part — build a CLI/web deposit
  path first (reusing the M0 provider) so the demo never blocks on wallet UX.
