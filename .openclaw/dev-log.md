# Dev Log — clawdrop

**Project:** clawdrop — Deploy per-user autonomous Solana AI agents powered by SendAI Agent Kit. Free trial chatbot → paid agent running 24/7.
**Repo:** https://github.com/lpsmurf/hfsp-labs-colosseum
**App #:** ___ of 100
**Stack:** TypeScript, React, Vite, Node.js, Solana (web3.js, spl-token), Gnosis Chain (ethers.js), Express, Mastra, MCP, Docker, PM2, nginx
**Stage:** prototype

---

## Metadata for Openclaw

**Target user:** Crypto-native users who want an autonomous AI agent managing their Solana wallet 24/7 — trading, DeFi, payments — without running their own infrastructure.
**Core problem solved:** Deploying and running a personal AI agent with real wallet access is too complex for most users; Clawdrop wraps it into a paid subscription with a Telegram interface.
**Differentiator:** Per-user Docker isolation with AES-GCM encrypted key storage; agents are built on SendAI Solana Agent Kit (60+ Solana tools) and exposed via MCP; payment-aware (x402 protocol) so agents can reason about on-chain payments and execution together.
**Current milestone:** Gnosis Circles mini app shipped — gift card redemption from Gnosis Safe via x402 bridge
**Notable features shipped:**
- `[USER-FACING]` Gnosis Card frontend — top up Gnosis Pay Safe from Solana/Base USDC (live at card.hfsp.cloud)
- `[USER-FACING]` Cryptorefills Redeem tab — 800+ gift cards/top-ups/eSIMs paid with Solana USDC via x402
- `[USER-FACING]` Circles Garage mini app — redeem gift cards from Gnosis Safe, paid via x402 bridge (live at card.hfsp.cloud/circles/)
- `[USER-FACING]` WDK browser extension — multi-chain Solana wallet (Chrome/Brave MV3, 7 networks)
- `[TECHNICAL]` x402-store internal endpoint — allows trusted backend-to-backend fulfillment without public Solana payment
- `[TECHNICAL]` Solana RPC proxy — Helius API key never reaches client bundle
- `[TECHNICAL]` Gnosis Safe on-chain inspector — classifies addresses as Gnosis Pay / Safe / EOA, reads live balances
**Links:** https://card.hfsp.cloud · https://card.hfsp.cloud/circles/

---

## Sessions

### 2026-06-27 Session 1

**Status at open:** x402-sdk + commerce skill + store live. Starting a new autonomous-agent product.
**Goal:** Prep kit (PLAN + PREP-KIT + runnable stubs) for a fully-autonomous, self-funding Solana shopping agent — own email/Telegram/wallet, pays its own LLM + purchase costs over x402.

#### Built / Changed
- `[USER-FACING]` `shopping-agent/` prep kit — PLAN.md (phased build, autonomy loop, adapter layer, bounty-skill spinoff) + PREP-KIT.md (doc-verified API refs + economics + Arm-B brief) + README.
- `[TECHNICAL]` Typed, swappable provider stubs: `agentmail-client.ts` (own email), `llm-x402-client.ts` (BlockRun `SolanaLLMClient`, self-funded inference), `keepa-client.ts` (price watch), `crossmint-client.ts` (Amazon crypto checkout), behind `providers.ts` adapter contracts. Reuses `@hfsp/x402-sdk` for our own paid services.
- `[USER-FACING]` `spend-guard.ts` — fail-closed autonomous-spend guardrail (per-tx + rolling 24h caps, merchant allowlist, human-confirm threshold). Self-test green in `demo.ts`.
- `[TECHNICAL]` `demo.ts` runs with zero keys (guardrail self-test + dry-run loop); `npm run typecheck` + `npm run demo` clean.

#### Decided / Learned
- `[LEARNING]` Chain-split finding: Crossmint's live Amazon/Worldstore checkout examples settle USDC on **Base/EVM**, not Solana — Solana settlement for Amazon is UNVERIFIED. Recommended: stay all-Solana, gift-card-first, probe staging before mainnet; only add a Base sub-wallet for Crossmint if forced. This (not Router402) is the real chain split.
- `[LEARNING]` Verified SDK shapes vs assumptions: BlockRun `@blockrun/llm` exposes `SolanaLLMClient` (bs58 `SOLANA_WALLET_KEY`, `chat`/`chatCompletion`/`chatCompletionStream`); AgentMail base `api.agentmail.to/v0`, inbox-per-agent REST; Keepa prices are integer cents (-1 = none) on a "Keepa-minutes" clock.

**Status at close:** Prep kit only — product NOT built (by design). Next: resolve open decisions in PLAN §7 (Crossmint staging probe first), then Phase 1 (self-funding inference).

---

### 2026-06-12 Session 1

**Status at open:** Openclaw integration added.
**Goal:** ___

#### Built / Changed
- `[TECHNICAL]` Added .openclaw/ folder and dev-log.md

**Status at close:** Openclaw integration logged.

---

### 2026-06-13 Session 1

**Status at open:** Gnosis Circles mini app shipped. Five production x402 services live.
**Goal:** Build `@hfsp/x402-sdk` — open-source Node.js middleware for Solana x402 payments, server + client, under 10 lines to add payment gating.

#### Built / Changed
- `[USER-FACING]` `@hfsp/x402-sdk` — new open-source package at `packages/x402-sdk/`. Server middleware (`x402()`) + client helper (`X402Client`). Extracted and generalized from five production x402 services. 11/11 tests passing, clean typecheck, ESM build.
- `[TECHNICAL]` `MemoryReplayStore` + `RedisReplayStore` — pluggable replay protection, no Redis required by default
- `[TECHNICAL]` `verifyTx` — standalone Solana tx verifier, works with any RPC (not Helius-only)
- `[USER-FACING]` `packages/x402-demo/` — live demo server for `demo.hfsp.cloud`. Three payment-gated endpoints ($0.001–$0.005 USDC). Port 3010.
- `[TECHNICAL]` `config/nginx/conf.d/demo.conf` — nginx config for demo.hfsp.cloud
- `[TECHNICAL]` PM2 ecosystem entry for `x402-demo` (port 3010, 128MB cap)
- `[TECHNICAL]` `scripts/deploy-x402-demo.sh` — one-command deploy: build → rsync → certbot → nginx reload → PM2 restart
- `[USER-FACING]` `marketplace/pay-skills/providers/hfsp/x402-sdk/` — pay-skills catalog entry with OpenAPI spec
- `[TECHNICAL]` `docs/devto-article-draft.md` — dev.to article draft ready to publish

#### Decided / Learned
- `[LEARNING]` Existing `requireSolanaPayment` in x402-vpn-vps was battle-tested — extracting it into the SDK required minimal changes beyond making `rpcUrl` and `mint` configurable
- `[TECHNICAL]` Used `@solana/spl-token` for client USDC transfers (ATA creation + transfer instruction) instead of raw instructions — cleaner and handles ATA creation edge case

**Status at close:** `@hfsp/x402-sdk` v0.1.0 scaffolded, tested, and built. Ready for npm publish or grant submission proof-of-work attachment.
