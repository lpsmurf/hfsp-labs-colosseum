# shopping-agent — prep kit

Fully-autonomous, self-funding **Solana shopping agent**: its own email (AgentMail) + Telegram, its
own Solana wallet, and it **pays for its own LLM inference and purchases over x402**. This directory
is a **PLAN + PREP KIT + runnable client stubs** — not the built product.

## Read first

- **[PLAN.md](PLAN.md)** — phased build plan, architecture, the autonomy loop, provider-adapter
  layer, "decisions to confirm", and the Superteam bounty-skill spinoff mapping.
- **[PREP-KIT.md](PREP-KIT.md)** — doc-verified API reference (AgentMail · BlockRun/Franklin · Keepa ·
  Crossmint · Zinc), self-funding economics, spend-guardrail design, reuse of our packages, setup
  checklist, and the Arm-B feasibility brief (subscription optimizer · debt negotiator · DeFi
  refinance) with the autonomy boundary + regulatory caveats up front.

## Run it (no API keys needed)

```bash
cd shopping-agent
npm install
npm run typecheck   # clean
npm run demo        # SpendGuard self-test (✓) + dry-run of the autonomy loop
```

The demo spends nothing: it proves the guardrails fail closed and prints the exact provider calls the
agent would make. Set keys in `.env` (see [`.env.example`](.env.example)) to turn DRY steps live.

## Stubs (typed, swappable — see [`providers.ts`](providers.ts))

| File | Provider | Role |
|---|---|---|
| [`agentmail-client.ts`](agentmail-client.ts) | AgentMail | the agent's own inbox-per-agent email |
| [`llm-x402-client.ts`](llm-x402-client.ts) | BlockRun `SolanaLLMClient` | self-funded inference (Solana USDC, x402) |
| [`keepa-client.ts`](keepa-client.ts) | Keepa | price history + drop watch |
| [`crossmint-client.ts`](crossmint-client.ts) | Crossmint | Amazon crypto checkout |
| [`spend-guard.ts`](spend-guard.ts) | — | per-tx/daily caps, allowlist, human-confirm (fail closed) |

## Two things flagged loudly (don't miss)

1. **Chain split:** Crossmint's *Amazon* checkout examples in live docs settle USDC on **Base/EVM**,
   not Solana — `UNVERIFIED` for Solana. Recommended default: stay all-Solana; probe staging before
   mainnet; gift-card-first. (PLAN §7.1 / PREP-KIT §4.)
2. **Arm B is roadmap, and the autonomy boundary matters:** **B1 subscription optimizer** is
   low-risk/near-build-ready (Plaid/GoCardless + inbox → flag waste → recommend cancel/downgrade +
   crypto-payable swaps). **B2 debt negotiation — ship draft-only first:** the agent reads the user's
   debt emails (forwarded to its AgentMail inbox) and **drafts** the ask; the **user copy-pastes into
   their own Gmail and sends** → self-help tool, ~B1-tier risk. Opt-in v2 (agent sends *as the user*,
   auto-sends only the *requests*, gates the commitments, flat fee never % of savings) needs legal
   sign-off — US TSR applies even with consent; NL Wck reserves debt-mediation to licensed parties; a
   drafted acknowledgment/promise can *revive* a time-barred debt. **B3 DeFi refinance** is
   illustrative-only (overcollateralized, liquidation risk). All consent-gated; none in the MVP.
   (PREP-KIT §10.)

Reuses `@hfsp/x402-sdk`, `x402-commerce-skill`, `x402-store`, `x402-wallet`, and
`clawdrop-agent-runtime` — see PREP-KIT §8.
