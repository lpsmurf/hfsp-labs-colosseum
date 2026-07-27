# PLAN — Autonomous Solana Shopping Agent

**Status: PLAN + PREP KIT (not built).** This document is the phased build plan for a
fully-autonomous, self-funding AI shopping agent in the Clawdrop / HFSP x402 ecosystem.
Companion: [PREP-KIT.md](PREP-KIT.md) (digested API references + economics) and the runnable
client stubs in this directory (`*-client.ts`, verified `typecheck` + `demo` clean — see
[README.md](README.md)).

> **Honesty key used throughout:** `LIVE` = working in our stack today · `PLANNED` = designed,
> not built · `NEEDS-KEY` = code ready, blocked only on an API credential · `UNVERIFIED` = a
> third-party capability we could not confirm against live docs and must validate.

---

## 1. What we're building (and what we're not)

**One sentence:** each user gets their own autonomous agent that has its own email (AgentMail) and
Telegram, its own Solana wallet, watches prices, and buys things on Amazon / as gift cards paying
in Solana USDC — **paying for its own LLM inference and its own purchases over x402**, with no human
in the loop for routine operation but hard guardrails on spend.

**Two arms — Arm A is the MVP; Arm B is roadmap.**

| Arm | Scope | Status in this plan |
|---|---|---|
| **A — Shopping** | find items on Amazon + gift cards, monitor prices, buy in Solana USDC | **MVP — build now** |
| **B — Money optimizer** | **B1** subscription audit → cancel/downgrade/switch + crypto-payable swaps · **B2** debt negotiation with creditors/collectors (lower balance + instalment plans) · **B3** optional DeFi refinance | **Roadmap.** B1 near build-ready (low regulatory); **B2 regulated → assisted self-representation: auto-send the *asks*, gate the *commitments*, flat fee only**; B3 illustrative-only. Caveats up front in PREP-KIT §10 |

**Non-goals for MVP (explicit):** no Arm B at all in the MVP; no operating as a debt-relief service
or credit-repair org — debt negotiation (Arm B/B2) is **consumer self-help, human-authorized per
message**, never a fully-autonomous unlicensed debt-settlement product (see PREP-KIT §10); no custody
of user funds beyond the agent's own top-up wallet; no Router402 / Base-only LLM path (we settle
inference on Solana via BlockRun); no rebuild of payment, Telegram, store, or ranking code we own.

---

## 2. Reuse map — build ON what we have

The MVP is mostly **integration**, not new infrastructure. What we already own:

| Need | Reused asset | Role | Status |
|---|---|---|---|
| x402 pay (our own services) | `packages/x402-sdk` (`@hfsp/x402-sdk`) — `X402Client` + `x402()` gate | Pay for gift cards / our gated APIs; verify-then-deliver (replay + freshness + resource binding) | LIVE |
| Buyer ranking + manifest lint | `x402-commerce-skill/` (`03-buyer-agent.md`, `checker/`) | Rank gift-card sellers by net cost; lint any x402 seller before paying | LIVE |
| Gift cards / top-ups / eSIMs | `packages/x402-store` (Cryptorefills proxy, Solana USDC + markup) | Gift-card arm of "find it, pay in crypto" | LIVE |
| Wallet UI + agent dashboard | `packages/x402-wallet` | User tops up the agent wallet; sees spend + low-balance | LIVE |
| Per-user agent + Telegram + MCP | `packages/clawdrop-agent-runtime` + `clawdrop-mcp-server` (SendAI Agent Kit) | The agent loop + Telegram interface (grammy) + Docker isolation | LIVE |
| KYC/KYB (if onboarding needs it) | `.claude/skills/sumsub-*` | Only if a provider requires verified identity | LIVE (tooling) |

What is **new** (thin, behind adapters): the AgentMail email layer, the BlockRun self-funding LLM
gateway, the Keepa price watcher, the Crossmint checkout adapter, and the **SpendGuard** — all in
this directory as typed stubs.

---

## 3. Architecture (text diagram)

```
                              ┌──────────────────────────────────────────────┐
   USER                       │            ONE AUTONOMOUS AGENT               │
  ┌──────┐  email  ┌────────┐ │  (per-user, isolated — clawdrop-agent-runtime)│
  │      │◀───────▶│AgentMail│◀┼─ own inbox: shopper-<id>@agent.hfsp.xyz      │
  │ user │         └────────┘ │                                              │
  │      │  Telegram ┌──────┐ │   ┌───────────────┐   ┌──────────────────┐   │
  │      │◀─────────▶│grammy│◀┼──▶│  AGENT LOOP   │──▶│   SpendGuard      │   │
  └──────┘           └──────┘ │   │ (decide/act)  │   │ per-tx/daily caps │   │
     │ tops up                │   └──────┬────────┘   │ allowlist+confirm │   │
     ▼ USDC                   │          │            └──────────────────┘   │
  ┌─────────────┐             │   ┌──────┴───────────────────────────────┐   │
  │ AGENT WALLET│◀────────────┼───│  provider adapters (swappable)        │   │
  │ Solana USDC │  pays from  │   │                                       │   │
  └─────────────┘             │   │  LlmGateway  → BlockRun SolanaLLMClient│   │
        ▲  ▲  ▲               │   │  PriceProvider→ Keepa  (→ Rainforest)  │   │
        │  │  └── x402 ────────┼──▶│  Checkout    → Crossmint (→ Zinc)      │   │
        │  └───── x402 ────────┼──▶│  (our gift cards → @hfsp/x402-sdk +    │   │
        │                      │   │   x402-store + commerce ranking)      │   │
        │                      │   └───────────────────────────────────────┘   │
        │  pay-per-request     └──────────────────────────────────────────────┘
        │  (inference, USDC)            │ x402 402→pay→retry          │ create order→sign→pay
        ▼                               ▼                             ▼
   ┌─────────┐                    ┌───────────┐                ┌───────────────┐
   │ BlockRun│ 60+ models         │   Keepa   │ price history  │   Crossmint   │ Amazon 1B+ items
   │ gateway │ +5% margin, Solana │  /product │ + drop alerts  │  /orders      │ crypto checkout
   └─────────┘                    └───────────┘                └───────────────┘
```

**Single rail principle:** inference (BlockRun `SolanaLLMClient`), gift cards (`x402-store`), and
our own gated services all settle in **Solana USDC** from the same agent wallet. The one place this
may break is Crossmint Amazon checkout — see §7 chain-split decision.

---

## 4. The provider-adapter abstraction

Everything external sits behind a narrow interface in [`providers.ts`](providers.ts), so each piece
is swappable without touching the loop:

| Interface | MVP impl (LIVE/NEEDS-KEY) | Swap-in (roadmap) | Why swappable |
|---|---|---|---|
| `LlmGateway.chat()` | `BlockRunLlmGateway` (BlockRun `SolanaLLMClient`, x402) | self-hosted x402 LLM gateway | model/price independence; never lock to one inference vendor |
| `PriceProvider.getProduct()` | `KeepaClient` (`/product`, stats+history) | Rainforest (richer live search) | Keepa = cheap history/alerts; Rainforest only if we need live catalog search |
| `CheckoutProvider.createOrder/payOrder/getTracking()` | `CrossmintClient` (Worldstore Amazon) | Zinc (lower-level order control) | Crossmint = managed crypto checkout; Zinc = fallback if we need raw control |
| `MailProvider` | `AgentMailClient` (inbox-per-agent REST) | any inbox-per-agent provider | email is identity infra, not a moat |

Telegram is **not** an adapter here — it's reused as-is from `clawdrop-agent-runtime`.

---

## 5. The autonomy loop

The agent runs this loop continuously (event-driven on email/Telegram + a price-watch timer). Every
money-out step passes through `SpendGuard` first, and every paid result is **verify-then-deliver**
(fail closed).

```
 0. PROVISION   on first boot: AgentMail.createInbox(agentId) → own email;
                Telegram pairing (clawdrop-agent-runtime) → own chat.

 1. WATCH       inbound triggers (any of):
                  • AgentMail message.received  (webhook → loop)
                  • Telegram message            (grammy → loop)
                  • price-watch timer           (Keepa poll on tracked ASINs)

 2. DECIDE      pay-for-LLM: BlockRunLlmGateway.chat(model, messages)  ← x402, self-funded
                  • classify intent (cheap model)  → parse "watch X / buy Y under $Z"
                  • rank candidates (reuse x402-commerce buyer ranking for gift cards)
                  • produce an ACTION + a cost estimate

 3. GUARD       SpendGuard.check({ kind, amountAtomic, merchant })
                  • per-tx cap, rolling 24h cap, merchant allowlist
                  • if amount ≥ humanConfirm threshold → ask user (email/Telegram), pause
                  • fail closed: deny → report why, do nothing

 4. ACT + PAY   on approval:
                  • Amazon  → Crossmint.createOrder → sign serializedTransaction → payOrder
                  • giftcard→ x402-store via @hfsp/x402-sdk X402Client (402→pay→200)
                  • SpendGuard.commit(amount) only after settlement confirms

 5. REPORT      AgentMail.reply / send + Telegram: receipt (tx sig, item, total, tracking).
                low-balance: if wallet USDC < alert threshold → email + Telegram the user to top up.
```

Mapped to the deliverable stubs: step 0 = `agentmail-client.ts`; step 1 watch = `keepa-client.ts`;
step 2 = `llm-x402-client.ts`; step 3 = `spend-guard.ts`; step 4 = `crossmint-client.ts` (+ reuse
`@hfsp/x402-sdk` for gift cards); step 5 = `agentmail-client.ts` + reused Telegram. Wiring shown in
`demo.ts`.

---

## 6. Data flow + state

- **Wallet:** one Solana keypair per agent (the autonomy unit). bs58 secret injected at spawn (reuse
  clawdrop-platform's AES-GCM key handling — never log it). Funds = user top-ups in USDC.
- **Watches:** `{ asin, targetUsd, notified }[]` per agent (persist in the agent's existing store).
  Keepa `/product` polled on a timer; a drop trips an alert (+ optional guarded buy).
- **Spend ledger:** `SpendGuard` keeps a rolling 24h in-memory ledger; persist commits so caps
  survive a restart (otherwise a crash resets the daily cap — a real abuse vector).
- **Email/threads:** AgentMail owns inbox + thread state; we store only `inboxId` per agent.
- **Orders:** Crossmint owns order lifecycle; we store `orderId` and poll tracking for receipts.
- **Idempotency:** key buys by `(agentId, asin, intentId)` so a retried loop never double-orders.

---

## 7. Decisions to confirm (open — do NOT guess)

These are the genuine open questions surfaced by research. The locked decisions (Franklin+BlockRun,
Crossmint, Keepa, AgentMail, both outputs) are **not** re-litigated here.

1. **⚠ Crossmint checkout chain split (highest priority, UNVERIFIED).** Every Crossmint
   physical-good / Worldstore *Amazon* example in the live docs settles USDC on an **EVM chain**
   (`base-sepolia` / `ethereum-sepolia`), **not Solana**. Crossmint supports Solana USDC on other
   flows, but Solana settlement *for Amazon checkout* is unconfirmed.
   **Recommended default:** keep the whole stack Solana; **before mainnet, run one staging order to
   confirm `payment.method:"solana"` is accepted for Amazon.** If it is not, the cleanest fix is a
   small **Base USDC sub-wallet** funded by a Jupiter/bridge top-up *only for Crossmint*, leaving
   inference + gift cards on Solana. Do **not** adopt Router402 to "solve" this — it's Base-only and
   excluded. (This, not Router402, is the real chain-split the brief asked us to flag.)
2. **AgentMail sending domain + deliverability.** Use AgentMail's shared domain for MVP, or
   provision `agent.hfsp.xyz` (SPF/DKIM/DMARC) so agent mail doesn't land in spam? Affects whether
   debt-negotiation emails (Arm B) are even openable. Default: shared domain for MVP, custom domain
   before Arm B.
3. **Gift-card vs Amazon priority for the first live buy.** Gift cards are 100% our rail today
   (`x402-store`, Solana USDC, LIVE) and de-risk the chain-split. **Recommend: first live purchase =
   a gift card via x402-store; Amazon/Crossmint second** once #1 is confirmed.
4. **Human-confirm threshold + caps defaults.** Proposed: per-tx $200, daily $500, human-confirm
   ≥$100, low-balance alert <$10. Confirm these are the right starting numbers for the pilot.
5. **BlockRun model routing.** Pin models per task (haiku→classify, sonnet→decide) or let BlockRun's
   Smart Router auto-pick? Default: pin for cost predictability in MVP; A/B the router later.
6. **Restart-safe spend ledger store.** Where do committed spends persist (SQLite alongside the
   agent? clawdrop-platform DB)? Needed so caps can't be reset by a crash-loop.

---

## 8. Milestones (phased)

**Phase 0 — Prep kit (this PR).** PLAN + PREP-KIT + typed client stubs + `demo` (guardrail self-test
+ dry-run loop) green. ✅ done.

**Phase 1 — Self-funding inference (NEEDS-KEY: wallet).** Wire `BlockRunLlmGateway` into the agent
loop; agent pays for its own classify/decide calls in Solana USDC. Prove one paid completion on a
funded devnet/mainnet wallet. *Exit:* agent answers a Telegram message using self-funded inference.

**Phase 2 — Own email (NEEDS-KEY: AgentMail).** Provision inbox-per-agent; inbound webhook → loop;
reply in-thread. *Exit:* user emails the agent "watch <ASIN> under $X", agent confirms by email.

**Phase 3 — Watch + alert (NEEDS-KEY: Keepa).** Keepa `/product` polling + drop detection; alert via
email + Telegram. No buying yet. *Exit:* a real price drop fires a real alert.

**Phase 4 — First guarded buy (gift card, LIVE rail).** Buy a gift card via `x402-store` +
`@hfsp/x402-sdk`, gated by `SpendGuard`, with email/Telegram receipt. *Exit:* end-to-end "find →
guard → pay (Solana USDC) → receipt" with our own rail.

**Phase 5 — Amazon checkout (NEEDS-KEY: Crossmint; depends on §7.1).** Crossmint Worldstore order →
sign → pay → poll tracking → receipt. Staging first; confirm Solana settlement before mainnet.
*Exit:* one real Amazon item bought autonomously under cap.

**Phase 6 — Hardening.** Persist spend ledger; low-balance auto-alerts; idempotency keys; the
human-confirm pause/resume flow; dashboard wiring in `x402-wallet`.

**Phase 7 — Arm B1: Subscription optimizer (roadmap, lowest-risk Arm-B piece).** Connect bank/
transaction data (Plaid in US, GoCardless/Nordigen in EU) and/or parse the AgentMail inbox; detect
recurring charges; label cryptic descriptors → merchants (Context `brand.identifyFromTransaction`);
flag duplicates, price hikes, dormant/forgotten trials; recommend cancel / downgrade / switch and
**crypto-payable alternatives from our own x402 ecosystem** (`x402-store`, Bazaar discovery).
Cancellation/downgrade emails are **drafted, human-confirm to send**. *Exit:* a "you're wasting
$X/mo" report + drafted cancel emails the user approves. (Honest scope: the agent sees *charges*, not
*usage* — see PREP-KIT §10/B1.)

**Phase 8 — Arm B2: Debt negotiator (roadmap, REGULATED).** Ship in two steps:
- **v1 (draft-only, lowest risk — recommended start, B1-tier).** The agent **reads** the user's debt
  emails (user **forwards** them to its AgentMail inbox — no Gmail OAuth) and **drafts** the negotiation
  email; the **user copies it into their own Gmail and sends**. User = the only sender → a self-help
  drafting tool, not a debt-relief service. Guards: flag likely **time-barred debts** before drafting
  any acknowledgment/promise (statute-of-limitations revival), flat fee, "not advice" disclaimer.
  *Exit:* an agent-drafted discount request the user pastes + sends.
- **v2 (assisted-send, opt-in, after legal sign-off).** Agent sends **as the user** and may auto-send
  the discount/hardship *requests* under standing consent — but **any email that binds the user**
  (accept terms, pay, or acknowledge/promise to pay) needs an **explicit click**, and the **fee must be
  flat, never contingent on savings** (TSR advance-fee ban). *Deliberately not* a fully-autonomous
  settler: US TSR (applies even with consent) + state licensing and NL **Wck** (*schuldbemiddeling*
  reserved to licensed parties) make an unlicensed auto-settler unlawful. See PREP-KIT §10/B2.

**Phase 9 — Arm B3 (optional): DeFi refinance survey.** Borrow-against-existing-crypto rate survey
(Kamino/MarginFi/Save/Drift/Lulo + LSTs) presented as *illustrative, non-advice* scenarios, with the
overcollateralization + liquidation caveats up front (see PREP-KIT §10/B3).

---

## 9. Bounty-skill spinoff — "Solana AI Kit" agent-skill

Cheap marketing for the product: a slim, self-contained **agent-skill** submitted to the Superteam
"Solana AI Kit" / skill-bounty, following the canonical format and reusing MVP pieces.

**Proposed skill: `solana-autonomous-shopper`** — "give an AI agent its own Solana wallet + email and
let it watch prices and buy in USDC, with spend guardrails it can't exceed." Honest scope: it ships
the **adapters + guardrail + a runnable proof**, not a hosted product.

Canonical layout (mirrors our existing `x402-commerce-skill/`):

```
skill/
  SKILL.md                 frontmatter (name/description/license) + progressive-disclosure router
  01-self-funding-llm.md   pay-per-request inference over x402 (BlockRun SolanaLLMClient)
  02-agent-email.md        inbox-per-agent (AgentMail) + verify-then-act on inbound
  03-price-watch-buy.md    Keepa watch → Crossmint/x402-store buy → receipt
  04-spend-guardrails.md   per-tx/daily caps, allowlist, human-confirm, low-balance
  examples/
    autonomous-buy-local/  RUNNABLE dry-run loop (our demo.ts, no keys needed)
  checker/
    spend-guard-lint.*     validator + tests: asserts caps fail closed, allowlist enforced
  README.md  LICENSE  install.sh
```

**MVP piece → skill artifact mapping:**

| MVP piece (this dir) | Becomes in the skill |
|---|---|
| `spend-guard.ts` + its self-test in `demo.ts` | `04-spend-guardrails.md` + `checker/spend-guard-lint` (the runnable "proof it runs") |
| `llm-x402-client.ts` | `01-self-funding-llm.md` reference + example |
| `agentmail-client.ts` | `02-agent-email.md` reference |
| `keepa-client.ts` + `crossmint-client.ts` | `03-price-watch-buy.md` reference |
| `demo.ts` (dry-run, zero keys) | `examples/autonomous-buy-local/` (proof it runs in ~30s) |
| `providers.ts` adapter contracts | the skill's swappability story (honest: which rails are LIVE vs PLANNED) |

Winning-entry checklist this satisfies: **runnable artifact** (`demo`/checker run with no external
service), **proof-it-runs** (guardrail self-test prints ✓ and the loop dry-runs), **honest scoping**
(LIVE vs PLANNED vs UNVERIFIED marked, chain-split disclosed). Reuses the linter+tests pattern we
already shipped in `x402-commerce-skill/checker/`.

---

## 10. Risks (top 5)

1. **Chain-split on Crossmint Amazon** (see §7.1) — mitigation: gift-card-first, staging probe, Base
   sub-wallet only if forced.
2. **Autonomous overspend** — mitigation: `SpendGuard` fail-closed + persisted ledger + human-confirm
   threshold; never run uncapped.
3. **x402 replay / stale-payment abuse** — mitigation: reuse `@hfsp/x402-sdk` replay + 300s freshness
   + resource binding; never act on an unverified payment or webhook.
4. **Inbox/bank privacy + debt-negotiation licensing (Arm B)** — mitigation: explicit revocable
   consent; **human-approved sends** (never fully-autonomous B2); consumer self-help framing; legal +
   jurisdiction review; not in MVP. See PREP-KIT §10.
5. **Provider API drift** — mitigation: the adapter layer + Context7/doc citations in PREP-KIT; pin
   and re-verify shapes before each phase goes live.
