# PREP-KIT — APIs, economics, guardrails

Digested, **doc-verified (2026-06-27)** reference for the autonomous shopping agent. Pairs with
[PLAN.md](PLAN.md). Every API shape below was checked against the cited live docs — where a shape was
**not** confirmable it is marked `UNVERIFIED`, not guessed. The runnable stubs in this directory
(`*-client.ts`) encode these shapes and `typecheck` + `demo` clean.

**Honesty key:** `LIVE` = in our stack now · `NEEDS-KEY` = code ready, needs a credential ·
`PLANNED` = designed not built · `UNVERIFIED` = third-party capability we must validate.

---

## 1. AgentMail — the agent's own email  `NEEDS-KEY`

> Docs: <https://docs.agentmail.to/introduction> · <https://docs.agentmail.to/api-reference> ·
> full text <https://docs.agentmail.to/llms-full.txt> · console <https://console.agentmail.to>

**What it is.** API-first email built for agents: programmatic **inbox-per-agent**, two-way threaded
email, inbound via webhooks/websockets, full-text search + structured extraction, usage-based pricing
(no per-inbox monthly fee, no hard sending limits). This is how each agent gets its *own* address.

- **Base URL:** `https://api.agentmail.to/v0`
- **Auth:** `Authorization: Bearer <AGENTMAIL_API_KEY>`
- **Node SDK:** `npm i agentmail` → `import { AgentMailClient } from "agentmail"` →
  `new AgentMailClient({ apiKey })`. (Our stub uses REST directly so it needs no install; the SDK is
  a drop-in upgrade — methods map 1:1: `client.inboxes.create`, `client.inboxes.messages.send/list/reply`.)

**Endpoints used (method · path · purpose):**

| Op | Method · Path | Notable fields |
|---|---|---|
| Create inbox | `POST /inboxes` | body `{ client_id?, username?, domain? }` → `{ inbox_id, address }` |
| List inboxes | `GET /inboxes` | — |
| Get inbox | `GET /inboxes/{inbox_id}` | — |
| Send message | `POST /inboxes/{inbox_id}/messages/send` | body `{ to, subject, text?, html? }` → `{ message_id }` |
| List messages | `GET /inboxes/{inbox_id}/messages?limit=` | `{ messages: [{ message_id, thread_id, from, subject, text, extracted_text }] }` |
| Get message | `GET /inboxes/{inbox_id}/messages/{message_id}` | — |
| Reply (in-thread) | `POST /inboxes/{inbox_id}/messages/{message_id}/reply` | body `{ text?, html? }` |
| List / get threads | `GET /inboxes/{inbox_id}/threads[/{thread_id}]` | thread view of a conversation |
| Create draft | `POST /inboxes/{inbox_id}/drafts` | Arm-B drafts (cancel + negotiation) — **human-approved before send** |

**Inbound webhook events:** `message.received`, `message.sent`, `message.delivered`,
`message.bounced`, `message.complained`, `message.rejected`, `domain.verified`. Route
`message.received` into the autonomy loop. **Gotcha / security:** verify the webhook signature before
acting — same verify-then-act discipline as x402; never act on an unverified inbound payload.

**Pricing/limits:** usage-based ("pay for what you use"); no per-inbox subscription, no restrictive
send/rate caps advertised. **Gotcha:** deliverability depends on the sending domain — for Arm-B
negotiation emails to be opened, provision a verified custom domain (SPF/DKIM/DMARC) rather than the
shared one (open decision PLAN §7.2).

Stub: [`agentmail-client.ts`](agentmail-client.ts).

---

## 2. BlockRun + Franklin — self-funding LLM over x402  `NEEDS-KEY (wallet only)`

> Docs: <https://blockrun.ai> · TS SDK <https://github.com/BlockRunAI/blockrun-llm-ts>
> (`@blockrun/llm`) · Py `blockrun-llm` · MCP `@blockrun/mcp` · Franklin
> <https://github.com/BlockRunAI/Franklin> (`@blockrun/franklin`)

**Decision locked:** build ON Franklin + BlockRun; use the native **`SolanaLLMClient`** so inference
settles in **Solana USDC** — same rail as purchases (no chain split for the LLM). Do **not** use
Router402 (Base-only) and do **not** build our own LLM proxy.

**BlockRun (the gateway).** Pay-per-call AI gateway: one OpenAI-compatible endpoint, **60+ models**
(69+ in the pricing table), **no API keys / no subscription** — each request is paid in USDC over
**x402**, at **provider cost + 5%**, settled on **Base & Solana**. Cheap (~$0.0002/request floor for
small models).

`@blockrun/llm` (TypeScript) surface — verified from the repo:

```ts
import { LLMClient, SolanaLLMClient, OpenAI } from "@blockrun/llm";

// Solana payment (our choice). Uses SOLANA_WALLET_KEY (bs58 secret) or pass it:
const solana = new SolanaLLMClient();                       // env SOLANA_WALLET_KEY
const solana2 = new SolanaLLMClient({ privateKey: "<bs58>" });

await solana.chat("anthropic/claude-haiku-4.5", "hi");      // simple → string
const r = await solana.chatCompletion("anthropic/claude-sonnet-4.6", [
  { role: "user", content: "rank these offers..." },
]);                                                          // → { choices:[{ message:{ content } }] }
await solana.chatCompletionStream(model, messages);         // native SSE stream

// OpenAI-compatible drop-in also available (Base example): new OpenAI({ walletKey }).chat.completions.create(...)
```

- **Model IDs (samples):** `anthropic/claude-opus-4.8`, `anthropic/claude-sonnet-4.6`,
  `anthropic/claude-haiku-4.5`, `openai/gpt-5.4`, `google/gemini-3.5-flash`, `nvidia/...` (free tier).
- **Payment is automatic:** the SDK signs the USDC payment before streaming; it caches the payment
  requirement per model so subsequent calls skip the 402 round-trip. `LLMClient` = Base (EVM),
  `SolanaLLMClient` = Solana — **same API, different chain.** Your private key never leaves the machine.
- **Under the hood** this is the same `402 → pay(USDC) → retry` loop our `@hfsp/x402-sdk` `X402Client`
  implements (`packages/x402-sdk/src/client/index.ts`). We let BlockRun own *LLM* payments and keep
  `@hfsp`'s client for paying *our own* gated services (gift cards).

**Franklin (the substrate).** "The AI agent with a wallet" — holds USDC (Base **or** Solana, set up
via `franklin setup solana`), **wallet-as-identity** (no email/phone/KYC), **YOPO** ("You Only Pay
Outcome") billing at provider cost + 5% via x402, and a **Smart Router** that classifies each request
and picks the best quality-to-cost model across 55+ (`auto`/`eco`/`premium`/`free` profiles). CLI-first,
single npm package (`@blockrun/franklin`), **Apache-2.0**, Node ≥20.19. We build the shopping + email
agent **on top of** it rather than reinventing the wallet/router.

**Gotcha:** keep model selection explicit per task in MVP (haiku=classify, sonnet=decide) for cost
predictability; evaluate the Smart Router later (PLAN §7.5). Stub: [`llm-x402-client.ts`](llm-x402-client.ts).

---

## 3. Keepa — price history + drop monitoring  `NEEDS-KEY`

> Docs: <https://keepa.com/#!api> · REST shape documented via the Python wrapper
> <https://keepaapi.readthedocs.io/en/latest/api_methods.html>

**What it is.** Amazon price-history + alerts. The Arm-A "watch" rail (decision locked; Rainforest is
a later swap for richer live search).

- **Base URL:** `https://api.keepa.com` · **Auth:** `?key=<KEEPA_API_KEY>` (64-char key, query param)
- **Product:** `GET /product?key=&domain=1&asin=<ASIN>&stats=180&history=1`
  - `domain` (id): **US=1**, GB=2, DE=3, FR=4, JP=5, CA=6, IT=8, ES=9, IN=10, MX=11, BR=12
  - `stats=<days>` adds a `stats` object (current/min/max/mean) — **no extra token**
  - `history=1` returns the `csv` arrays; `offers=20..100` adds live offers (costs more tokens)
- **Other endpoints:** `/deals` (drop finder), `/product-finder` (`/query`, search by price/rating),
  `/best-sellers`.

**The two gotchas that break naive integrations** (both handled in the stub):

1. **Price = integer CENTS; `-1` = "no data"** (out-of-stock sentinels also read as negative). Always
   map any negative → `null`. `1999` → `$19.99`.
2. **Time = "Keepa minutes"** = minutes since the Keepa epoch (2011-01-01). Convert:
   `unixMs = (keepaMinute + 21564000) * 60000`. Each `csv[type]` is a flat
   `[time, value, time, value, …]` series; **type indices:** `AMAZON=0, NEW=1, USED=2, SALES=3,
   LISTPRICE=4`.

**Pricing/limits:** **token bucket** — each `/product` call ≈ 1 token; tokens refill over time and
unused tokens expire after ~1 hour. **Batch** comma-separated ASINs and **cache** to stay under the
bucket; back off on `tokensLeft`/`refillIn`. Stub: [`keepa-client.ts`](keepa-client.ts) (incl. CSV
decode + `keepaMinuteToUnixMs` + `centsToUsd`).

---

## 4. Crossmint — Amazon crypto checkout  `NEEDS-KEY` (+ `UNVERIFIED` chain)

> Docs: Amazon <https://docs.crossmint.com/payments/headless/guides/providers/amazon> · physical
> goods <https://docs.crossmint.com/payments/headless/guides/physical-good-purchases> · Worldstore
> (agents) <https://docs.crossmint.com/agents/payment-flows/worldstore/inventory> · order mgmt
> <https://docs.crossmint.com/agents/payment-flows/worldstore/order-management> · quickstart
> <https://www.crossmint.com/quickstarts/purchase-on-amazon-using-crypto>

**What it is.** Headless Checkout / **Worldstore**: buy any of **1B+ products** (Amazon, Shopify,
flights) via one Orders API and pay in crypto. The Arm-A "buy" rail (decision locked; Zinc is the
later lower-level fallback).

- **Base URL:** prod `https://www.crossmint.com/api/2022-06-09` · staging
  `https://staging.crossmint.com/api/2022-06-09`
- **Auth:** `X-API-KEY: <server-side key>` with scopes **`orders.create`, `orders.read`,
  `orders.update`**
- **Create order:** `POST /orders`

```jsonc
// verified body shape (Amazon physical good)
{
  "recipient": {
    "email": "buyer@example.com",
    "physicalAddress": { "name": "Jane Doe", "line1": "123 Main St", "line2": "",
                         "city": "San Francisco", "state": "CA", "postalCode": "94105", "country": "US" }
  },
  "payment": { "method": "solana", "currency": "usdc", "payerAddress": "<agent wallet>" },
  "lineItems": [{ "productLocator": "amazon:B01DFKC2SO" }]   // or "amazon:https://www.amazon.com/dp/B01DFKC2SO"
}
```

- **Response → pay:** the order returns `order.orderId`, a `phase`, a `quote.totalPrice`, and
  `payment.preparation.serializedTransaction` (base64). The agent **deserializes, signs with its own
  Solana wallet, and submits** the tx (our stub uses `@solana/web3.js` `VersionedTransaction`).
- **Track:** `GET /orders/{orderId}/tracking` → `{ status, packageTracking{ carrier, trackingNumber },
  deliveryTimeRange{ lowerBound, upperBound } }` (delivered status guaranteed for Amazon). Refunds:
  `POST/GET /orders/{orderId}/refunds` (statuses `refund-request-initiated/accepted/rejected/completed`).

**⚠ Gotcha — the real chain split (`UNVERIFIED`).** Every Amazon/Worldstore example in the live docs
uses **EVM** payment (`method:"base-sepolia"` / `"ethereum-sepolia"`, `currency:"usdc"`,
`payerAddress:"0x…"`). Solana USDC is documented for *other* Crossmint flows but **not confirmed for
Amazon checkout.** Our stub defaults to `method:"solana"` (to match the rest of the stack) but flags
this everywhere. **Action before mainnet:** place one staging order and confirm Solana is accepted; if
not, fund a small **Base USDC sub-wallet** for Crossmint only (inference + gift cards stay on Solana).
**Do not** reach for Router402 — it's Base-only and excluded. (PLAN §7.1)

**Fail-closed rule:** the stub aborts the buy if the returned quote exceeds the caller's `maxTotalUsd`
*before* signing any payment. Stub: [`crossmint-client.ts`](crossmint-client.ts).

---

## 5. Zinc — lower-level Amazon ordering (fallback, `PLANNED`)

> Docs: <https://docs.zincapi.com> · orders <https://github.com/zincio/apidocs>

Not in MVP — the swap-in if we ever need raw order control Crossmint doesn't expose. Key facts for the
adapter: `POST` an order with `retailer`, `products[]`, `shipping_address`, `max_price` (default
$1,000,000 — **always set a real ceiling**). **Managed Accounts ("Addax):** add `"addax": true` and
**omit** `retailer_credentials`/`payment_method`/`billing_address` (Zinc funds + places the order from
a prepaid balance) — simplest path, but it is **fiat-funded, not crypto**, so it would sit *behind* our
USDC layer, not replace it. That mismatch is exactly why Crossmint (native crypto checkout) is the MVP
choice and Zinc is only a fallback.

---

## 6. Agent architecture (how the pieces compose)

```
clawdrop-agent-runtime (reused)         this prep kit (new, thin)
 ├─ grammy Telegram bot   ───────────┐
 ├─ MCP client (SendAI tools)        │   providers.ts  (adapter contracts + USDC helpers)
 └─ agent loop (decide/act) ─────────┤   spend-guard.ts (caps/allowlist/confirm — fail closed)
                                     ├─ agentmail-client.ts  (own email)
 packages/x402-sdk (reused)          ├─ llm-x402-client.ts   (self-funded inference, Solana USDC)
 ├─ X402Client (pay our services) ───┤   keepa-client.ts     (watch)
 └─ x402() gate (verify-then-deliver)│   crossmint-client.ts (buy + pay + track)
 x402-store (reused): gift cards ────┘   demo.ts (wires the loop; guardrail self-test)
 x402-commerce-skill (reused): buyer ranking + manifest lint
 x402-wallet (reused): top-up + spend dashboard
```

One **Solana keypair per agent** is the unit of autonomy: it signs inference payments (BlockRun),
gift-card payments (`@hfsp/x402-sdk`), and Amazon payments (Crossmint). Inject the bs58 secret at spawn
via clawdrop-platform's existing AES-GCM handling; never log it.

---

## 7. Self-funding economics + spend guardrails

**Funding model.** The user tops up the agent's USDC wallet (via `x402-wallet`). The agent spends that
balance on two things, both over x402: **(a) inference** (BlockRun, ~$0.0002–cents per call, provider
+5%) and **(b) purchases** (gift cards via `x402-store`; Amazon via Crossmint). When balance drops
below the low-balance threshold, the agent **emails + Telegrams the user to top up** (it cannot top
itself up).

**Unit economics (rough, validate live):**
- Inference per user-turn: ~1 classify (haiku) + ~1 decide (sonnet) ≈ **sub-cent to a few cents**.
- Gift card: face value + `x402-store` commission markup (our revenue).
- Amazon: item price + any Crossmint fee + network fee (USDC transfer is fractions of a cent on Solana).
- **Margin:** BlockRun adds +5% on inference (a cost, not our take); our revenue is the `x402-store`
  markup and any service fee we add on Crossmint orders.

**Guardrails (`spend-guard.ts`, fail closed):**

| Control | Default | Enforced where |
|---|---|---|
| Per-transaction cap | **$200** | every spend `check()` |
| Rolling 24h cap | **$500** | rolling ledger, prunes >24h |
| Merchant allowlist | `["amazon:", "giftcard:"]` | purchases only (inference bypasses) |
| Human-confirm threshold | **≥ $100** | purchases ≥ threshold pause for user OK (email/Telegram) |
| Low-balance alert | **< $10** | balance check → notify user to top up |

`check()` decides but does **not** spend; `commit()` records only **after settlement confirms**, so a
denied/aborted buy never burns budget. The 24h ledger must be **persisted** (PLAN §7.6) so a crash-loop
can't reset the daily cap. The guardrail self-test in `demo.ts` proves: tiny inference passes; $40 buy
passes; $150 buy is flagged for confirm; $250 blocked by per-tx; non-allowlisted merchant blocked;
daily cap blocks after $400, then re-allows once the window rolls off.

---

## 8. Reuse of our existing packages (don't rebuild)

| You need… | Use | Don't build |
|---|---|---|
| Pay our own x402 services / verify a seller's payment | `@hfsp/x402-sdk` `X402Client` + `x402()` | a new payment client/middleware |
| Rank sellers by net cost; lint a manifest before paying | `x402-commerce-skill` `03-buyer-agent.md` + `checker/` | new ranking/linter |
| Buy gift cards / top-ups / eSIMs in Solana USDC | `packages/x402-store` | a new commerce backend |
| Telegram interface + per-user agent loop + Docker isolation | `clawdrop-agent-runtime` (+ `clawdrop-mcp-server`) | a new bot/runtime |
| Top-up + spend dashboard | `packages/x402-wallet` | a new wallet UI |
| KYC/KYB if a provider demands it | `.claude/skills/sumsub-*` | a new identity flow |

---

## 9. Setup checklist

1. `cd shopping-agent && npm install` → `npm run typecheck` (clean) → `npm run demo` (guardrail
   self-test + dry-run loop, **no keys needed**).
2. `cp .env.example .env` (`.env` is gitignored). Fill in as you light up each phase:
   - **Wallet:** `SOLANA_WALLET_KEY` (bs58) + `HELIUS_RPC_URL`; fund it with USDC.
   - **Inference (Phase 1):** `npm i @blockrun/llm` (optional dep, dynamic-imported); wallet funds it.
   - **Email (Phase 2):** `AGENTMAIL_API_KEY` from <https://console.agentmail.to>.
   - **Watch (Phase 3):** `KEEPA_API_KEY` from <https://keepa.com/#!api>.
   - **Checkout (Phase 5):** `CROSSMINT_API_KEY` (scopes `orders.create/read/update`),
     `CROSSMINT_ENV=staging`.
   - **Telegram:** `TELEGRAM_BOT_TOKEN` (reuse clawdrop-agent-runtime pairing).
3. Tune caps: `SPEND_PER_TX_USD`, `SPEND_DAILY_USD`, `SPEND_HUMAN_CONFIRM_USD`,
   `SPEND_LOW_BALANCE_ALERT_USD`.
4. **Before any mainnet buy:** run the Crossmint staging probe to resolve the chain-split (PLAN §7.1);
   do the **first live buy as a gift card** via `x402-store` (100% our Solana rail).

---

## 10. Arm B — money optimizer (roadmap; caveats first, then feasibility)

Arm B is **three separable pieces** with very different risk. **Read the autonomy boundary first**,
because it is the single most important honest finding here:

> **The autonomy boundary.** Arm A (shopping) can be *fully autonomous* — spend caps make routine
> buys safe. **Arm B/B2 (debt negotiation) is partly autonomous, by law.** A fully-autonomous,
> unlicensed agent that negotiates *and settles* a consumer's debts is a **regulated activity**
> (TSR/Wck — §B2). The lawful shape is **assisted self-representation**: the agent reads, analyses,
> drafts, computes offers, sends **as the user** (their identity), and may **auto-send the low-risk
> discount-request emails under standing consent** — but **any email that binds the user** (accepting
> terms, paying, or acknowledging/promising to pay — which can *revive* a time-barred debt) needs an
> **explicit click**, and the **fee can't be contingent on savings**. So: "auto-send the asks, gate
> the commitments," never an unlicensed "set-and-forget settler." B1 (subscriptions) is low-risk and
> near-build-ready; B3 (DeFi refinance) is illustrative.

Cross-cutting privacy gate (all of Arm B): reading a user's inbox or bank transactions is
privacy-heavy — **require explicit, scoped, revocable consent**; default off; never in the MVP; store
the minimum. If bank-data linking needs identity verification, reuse `.claude/skills/sumsub-*`.

### B1 — Subscription optimizer  `PLANNED` (lowest-risk, build-ready)

**Goal (your ask):** analyse what the user is paying for, flag what they should drop or downgrade,
and recommend cheaper / crypto-payable alternatives.

**Honest scope — charges, not usage.** The agent can see **recurring *charges*** (bank + email
receipts); it generally **cannot see actual product usage** (no telemetry into Netflix/Adobe/etc.).
So "subscriptions you don't use" is inferred from **detectable proxies**, then confirmed with the
user: recurring charge cadence, **duplicates/overlap** (two cloud drives, three streaming services),
**price hikes** vs history, **forgotten free-trial → paid conversions**, and **dormancy** (no related
receipts/logins seen in the inbox for *N* months). Say this plainly to the user; don't claim usage
insight you don't have.

**Rails (verified 2026-06-27):**

| Need | Rail | Notes |
|---|---|---|
| Recurring spend, US | **Plaid** `POST /transactions/recurring/get` → `streams` (merchant, category, last amount, frequency, `status` incl. `early_detection`) | the cleanest recurring-stream detector; needs Plaid Link consent |
| Recurring spend, EU/EEA | **GoCardless Bank Account Data** (ex-**Nordigen**) — PSD2 AISP, **free tier ~50 connections/mo**, endpoints `accounts/details · balances · transactions` (≤24 mo history, 90-day access) | EEA/UK; bank rate limits can be as low as **4 calls/day/account** → cache hard. Matches the NL/"incasso" context |
| Label cryptic descriptors → brand | **Context** `brand.identifyFromTransaction({ transaction_info })` (MCP already wired: `context_dev_api`) | turns `"AMZN MKTP US*1A2B3"` → recognizable merchant + logo for the report |
| Receipts when no bank link | the agent's **AgentMail** inbox (§1) | parse order/renewal receipts the same way the loop already reads mail |
| Cancel/downgrade action | **draft email via AgentMail, human-confirm to send** | many cancels need a portal/login the agent shouldn't drive autonomously — draft + hand off |
| **Crypto-payable alternatives** | our **own ecosystem**: `x402-store` (gift cards/top-ups/eSIMs in USDC), x402 **Bazaar** discovery of crypto-payable services, OpenClaw marketplace | on-brand: recommend swapping a fiat SaaS for a crypto-payable equivalent or paying via our rails |

**Output:** a "you're spending $X/mo across N subscriptions; here are M to cancel/downgrade and K
crypto-payable swaps" report (email + Telegram + `x402-wallet` dashboard), with **drafted** cancel
emails the user approves. Reuses the same SpendGuard/consent discipline as Arm A.

### B2 — Debt negotiator  `PLANNED` (high-value, REGULATED, assisted self-representation)

**Goal (your ask):** draft *and send* negotiation emails to the institution on the user's behalf,
with the user's agreement, asking for discounts / better terms on an existing debt with the **same**
creditor.

**Two things in the "same institution, with user agreement, just better terms" theory are wrong —
verified, and they change the design (not whether we build it):**

1. **"Same institution / just better terms" is *exactly* what's regulated.** The trigger isn't the
   debt moving creditors (that was B3/DeFi). Negotiating a **discount, settlement, or instalment plan
   on an existing debt** is the textbook definition of "debt **negotiation**/settlement services" the
   FTC **TSR Debt-Relief Rule** covers. Staying with the same creditor does not exempt it.
2. **"With the user's agreement / on the user's behalf" does *not* exempt it either.** The TSR
   **applies regardless of consumer consent**, and third parties acting *on the consumer's behalf*
   have **always been covered** — consent is *assumed* in the regulated model, it isn't a carve-out.
   There's even **"substantial assistance" liability** for helping someone violate the TSR. *(FTC TSR
   Debt-Relief Guide; FTC "Complying with the TSR".)* In **NL**, negotiating a consumer's debts as a
   business (*schuldbemiddeling*) is **reserved by the Wck** to licensed parties (municipalities,
   credit banks, lawyers, administrators, *deurwaarders*); **Wki** (1 Apr 2024) adds Justis
   registration for collection work. *(Wck; Wki / Rijksoverheid; AFM.)*

**So: the regulator cares about (a) WHO is the actor and (b) WHAT the email legally does — not the
creditor.** That gives a build-able design that still gets you most of "the agent negotiates the
discount for me":

- **Send *as the user*, not as a named third-party representative.** Outbound goes from the **user's
  own identity** (their name; ideally their own address). The agent is the user's drafting + sending
  assistant — *assisted self-representation* — which keeps the user as the actor and out of the
  third-party-negotiator bucket. Sending from the *agent's* inbox, signed as "negotiating on behalf
  of X," is the version that trips TSR/Wck.
- **Standing consent CAN cover the low-risk asks.** With the user's up-front agreement, the agent may
  autonomously send **inquiry / discount-request / hardship-explanation** emails (the "would you
  accept 60% as a lump sum / a €50/mo plan?" asks). This is the autonomy you want, on the safe subset.
- **Hard-gate every email that creates legal effect for the user** (always explicit per-message
  confirm — not because of optics, because it can *harm* the user):
  - accepting / agreeing to any terms or settlement, or scheduling a payment;
  - **acknowledging the debt in writing or promising to pay a specific amount** — in **most US states
    this *revives* a time-barred debt and restarts the statute of limitations** (a $1 payment or a
    written "I'll pay" can hand the collector the right to sue again). An agent that does this
    autonomously could *create* liability the user didn't have. *(CFPB/FTC on time-barred "zombie"
    debt.)*
  - sharing financial / hardship documents.
- **Never** autonomously enter a binding settlement.
- **Fee model is a hard constraint, not a detail.** Charge a **flat subscription for the tool**, never
  a **% of savings or any fee contingent on settlement** — TSR's advance-fee ban makes the
  contingency model illegal unless the debt is already altered *and* the user has paid ≥1 instalment.
- **Jurisdiction-gate + disclaimers.** Gate behaviour by the user's (and creditor's) country; standing
  "this is not financial/legal advice, not a credit-repair service" disclaimer; no false statements
  (the user is legally responsible for what the agent sends as them); GDPR consent for inbox/bank
  access. **For NL specifically, even "send as the user" needs legal sign-off** — the safest route may
  be partnering with / routing to a Wck-licensed party.

**Net:** the agent can absolutely **read the letters, compute realistic offers, draft the emails, and
auto-send the *discount-request* round under standing consent** — that's a real, useful, defensible
product. What it must **not** do unsupervised is **accept terms, promise/acknowledge, or pay** — those
need a click, and the fee can't be contingent on savings. This is not "approve every email," but it is
"approve the ones that bind you." Get a fintech/consumer-credit lawyer to sign off the per-jurisdiction
line before launch.

**Recommended v1 — draft-only, the user sends (the lowest-risk start; ship this first).** The cleanest
possible footprint: the agent **reads** the user's debt emails and **drafts** the negotiation email;
the **user copies it into their own Gmail and sends it themselves**. Now the user is unambiguously the
*only* actor and the *only* sender, which moves the product from a "debt-relief **service**" toward a
**self-help drafting tool** (closer to B1-tier risk) while keeping ~all the value — the agent untangles
the inbox and writes the perfect ask. Residual caveats that still apply:

- **Time-barred-debt guard.** Don't draft an **acknowledgment or promise-to-pay** for an old/possibly
  time-barred debt **without a prominent warning** — the user pasting + sending it still *revives* the
  debt (statute-of-limitations reset). Detect likely-time-barred debts and flag before drafting.
- **Fee = flat subscription**, never % of savings (stays clear of the TSR advance-fee line even though
  a pure self-help tool is far from it).
- **Marketing + content.** Don't promise outcomes, don't brand it credit-repair/debt-settlement, carry
  a "not legal/financial advice" disclaimer, and draft only from facts the **user** supplies (never
  fabricate hardship).
- **Reading access — a real choice.** Simplest: the user **forwards** debt emails to the agent's
  **AgentMail** address (no OAuth, no platform review — reuses the rail we already picked). Reading
  their live Gmail instead needs the **`gmail.readonly` restricted scope**, which triggers **Google's
  CASA security assessment** for production — heavier; prefer forward-to-AgentMail for v1.
- **NL** still warrants a quick legal check (the Wck definition is broad), but a user-sends drafting
  tool is the lightest footprint there is.

This v1 is essentially as safe as B1, so it can ship on the same timeline; "auto-send the asks" (above)
becomes an opt-in v2 once the fee model + per-jurisdiction disclaimers have legal sign-off.

### B3 — DeFi refinance (optional)  `PLANNED` (illustrative-only)

The prior framing, kept as an adjacent module. **Caveats first:** you **cannot move unsecured fiat
debt on-chain**; Solana DeFi lending is **overcollateralized** (post crypto worth *more* than you
borrow). The only real use case is a user who **already holds crypto** borrowing stablecoins **against
it** at a lower rate to refinance high-APR fiat debt — avoiding a taxable sale and lowering the rate,
**at the cost of fast liquidation risk** if collateral drops. Survey targets: Kamino, MarginFi, Save
(ex-Solend), Drift, Lulo, LSTs (Sanctum/Marinade/Jito). Present **illustrative, non-advice** scenarios
(fiat APR vs borrow APR + liquidation buffer) only; never auto-borrow. Gated on legal review.

---

## 11. Sources (verified 2026-06-27)

- AgentMail — <https://docs.agentmail.to/introduction>, `/api-reference`, `/llms-full.txt`,
  <https://console.agentmail.to>
- BlockRun — <https://blockrun.ai>, <https://github.com/BlockRunAI/blockrun-llm-ts>,
  <https://github.com/BlockRunAI/blockrun-llm>, <https://www.npmjs.com/package/@blockrun/llm>
- Franklin — <https://github.com/BlockRunAI/Franklin>, `@blockrun/franklin`
- Keepa — <https://keepa.com/#!api>, <https://keepaapi.readthedocs.io/en/latest/api_methods.html>
- Crossmint — Amazon/physical-good/Worldstore guides + quickstart (links in §4)
- Zinc — <https://docs.zincapi.com>, <https://github.com/zincio/apidocs>
- Arm B/B1 rails — Plaid Recurring Transactions
  <https://plaid.com/docs/api/products/transactions/> (`/transactions/recurring/get`) · GoCardless
  Bank Account Data (ex-Nordigen) <https://developer.gocardless.com/bank-account-data/overview/> ·
  Context Dev `brand.identifyFromTransaction` (MCP `context_dev_api`)
- Arm B/B2 regulatory — FTC TSR Debt-Relief Rule
  <https://www.ftc.gov/business-guidance/resources/debt-relief-services-telemarketing-sales-rule-guide-business>
  · Complying with the TSR (covers third-party "on behalf of" + consent)
  <https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule> · 16 CFR Part
  310 <https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310> · CFPB time-barred
  ("zombie") debt revival
  <https://www.consumerfinance.gov/ask-cfpb/can-debt-collectors-collect-a-debt-thats-several-years-old-en-1423/>
  · NL Wki / incasso
  <https://www.rijksoverheid.nl/actueel/nieuws/2024/02/09/per-1-april-regels-voor-incassodienstverlening>
  · AFM "Consumenten en Incassotrajecten" · NL Wck (*schuldbemiddeling* reserved parties)
- Our stack — `packages/x402-sdk`, `x402-commerce-skill/`, `packages/x402-store`,
  `packages/x402-wallet`, `packages/clawdrop-agent-runtime`
