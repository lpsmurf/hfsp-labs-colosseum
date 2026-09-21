# On-chain Analysis: Wash-Trading & Market-Maker Detection (Bankr / agent tokens)

**Date:** 2026-06-06
**Auditor:** HFSP Labs
**Tool:** [`scripts/wash-probe.ts`](../scripts/wash-probe.ts)
**Data sources (all keyless):** Base RPC (Transfer logs) · Blockscout (funder/deployer + labels) · GeckoTerminal (price/volume)

---

## Why

The Bankr/agent-token ecosystem shows "lots of deployed agents," but ~88% of
third-party Bankr tokens record <$10k lifetime volume. Of the ones that *do* show
volume, the open question is **organic demand vs. wash trading vs. paid
market-making**. This tool answers it per token with on-chain evidence.

## Method (what the tool measures)

1. **Pull every `Transfer` event** for the token over a window (default 24h) from a public Base RPC.
2. **Auto-detect the liquidity side** (pools/routers) as high-degree addresses.
3. **Classify each trader** buys vs sells; compute:
   - **Concentration** — top-5 share, HHI (sybil/cartel signal).
   - **Round-trip churn** — % of volume the *same wallet* both bought and sold (core wash signal).
   - **Circular EOA↔EOA** flows.
4. **Market-maker / bot detection** — wallets that are two-sided + high-frequency + near-flat-net + regular cadence.
5. **Funder/deployer tracing (Blockscout)** — find each top wallet's funder (EOA) or deployer (contract); cluster by origin to catch *many-wallets-one-funder* sybils; and **reclassify named infra** (UniversalRouter, GPv2Settlement, position managers, bridges) out of the trader/MM buckets.
6. **Verdict:** ORGANIC / MIXED / WASH-SUSPECT (washScore 0–5). Conservative by design — MMs round-trip too, so churn alone is "suspect," not "guilty."

### Honest limits
- **CEX-funded detection is label-dependent** — Blockscout doesn't tag every exchange hot wallet, so "CEX-funded: 0" means *unconfirmed*, not *none*.
- **Sybil tracing is one hop deep** — a multi-hop laundered funding tree can evade it.
- **On-chain vs reported volume** ratio is a sanity check, not proof; multi-hop routing inflates raw transfer counts.

---

## Case study: GITLAWB (`0x5f98…dba3`) — VERDICT: ORGANIC (0/5)

A "decentralized GitHub for AI agents"; also a live skill in the BankrBot/skills repo.

| Metric | Value | Read |
|---|---|---|
| Real traders (24h) | **482** | broad participation |
| Top-5 share / HHI | 30.8% / **349** | very distributed (not a cartel) |
| Buys / sells | 2632 / 1899 | net buying pressure |
| Round-trip churn | 30% | moderate; 70% is directional |
| MM/bot wallets | 61 (**~27%** of vol) | real MM layer present, not dominant |
| Sybil clusters | 1 cluster of **2** wallets | negligible — no wallet farm |
| On-chain vs reported vol | 0.53 | reported ~2× on-chain (worth a look) |

**Funder-trace corrected the picture:** 9 "top traders" were actually DEX
infrastructure — Uniswap **UniversalRouter** & **NonfungiblePositionManager**, CoW
**GPv2Settlement**, **RelayRouterV3**, **MayanForwarder2** (cross-chain),
**DexAggregatorCore**. Routing through CoW + cross-chain bridges is itself a strong
*organic* signal — wash farms don't.

**Market-maker:** the primary MM `0x8f10…` is a **deployed bot contract** doing
**159 two-sided trades/day**, ending net +$23k long (an MM that also takes a
position — not a flat-net wash bot). A second operator runs two smaller bot
contracts (`0xee22`+`0xc3b9`, shared funder `0x3304e2`).

**Conclusion:** real, broadly-distributed trading with a legitimate ~27%
market-maker layer. Not wash, not sybil.

---

## Batch comparison (agent / Bankr tokens, 24h, 2026-06-06)

| Token | Address | Real traders | Top-5 | HHI | Churn | MM vol% | Sybil | Verdict |
|-------|---------|-------------:|------:|----:|------:|--------:|-------|---------|
| GITLAWB | 0x5f98…dba3 | 482 | 31% | 349 | 30% | 27% | 2-wallet | **ORGANIC** |
| BNKR | 0x22af…6f3b | 488 | 61% | 869 | 34% | 32% | minor | **ORGANIC** |
| DRB | 0x3ec2…8ea2 | 216 | 51% | 702 | 24% | 17% | — | **ORGANIC** |
| A0T | 0xcc4a…5e03 | 61 | 48% | 632 | 23% | 2% | minor | **ORGANIC** |
| BLUEAGENT | 0xf895…6ba3 | 51 | 51% | 760 | 50% | 1% | — | **ORGANIC**¹ |
| **CLANKER** | 0x1bc0…1bcb | 237 | 68% | **2146** | **58%** | **66%** | — | **MIXED**² |
| **JUNO** | 0x4e6c…0b07 | **89** | **72%** | 1643 | 47% | 29% | **4-wallet** | **MIXED**³ |

¹ BLUEAGENT: GeckoTerminal reports **$0** 24h volume yet 51 wallets traded on-chain — its venue isn't indexed; thin/illiquid, treat cautiously.
² **CLANKER — MM-DOMINATED:** 66% of volume is bot/MM, 58% same-wallet churn. One wallet (`0x47f5…`) round-tripped **$447k in 5 trades (100% churn)**; `0xc216…` ran 41 trades at ~3-min cadence (95% churn). A real platform, but its *headline volume is mostly bots cycling*, not organic demand. On-chain > reported (1.67×) confirms heavy intra-chain routing.
³ **JUNO — CONCENTRATED + SYBIL:** only 89 traders, top-5 = 72%, and funder `0x3304e2…` seeds **4 "distinct" trader wallets**. Smallest/most manipulable of the set.

### The spectrum (not a binary)
None are pure wash farms, but the tokens fan out clearly:
**Healthy organic** (GITLAWB, BNKR, DRB) → **thin but real** (A0T, BLUEAGENT) → **volume inflated by MM bots** (CLANKER) → **concentrated + sybil-seeded** (JUNO).
"Reported 24h volume" is the *least* reliable number — CLANKER's looks great while being two-thirds bots; BLUEAGENT shows $0 despite real wallets.

---

## ⚠ Headline: shared cross-token operators

The supposedly-independent agent tokens are serviced by **a small shared set of
market-making / bot operators** — the on-chain analog of the x402
[catalog-inflation finding](catalog-inflation-payto-clusters.md).

| Operator | Type | Appears as top actor in | Role |
|----------|------|-------------------------|------|
| `0x8f10b468…f996` | unnamed bot **contract** | **5 of 7**: GITLAWB, BNKR, DRB, CLANKER, JUNO | cross-token **market-maker bot** (two-sided, high-frequency) |
| `0x3304e22d…566a` | **EOA** funder | **3 of 7**: GITLAWB, JUNO, A0T | funds clusters of bot trader wallets |

**Implication:** a meaningful slice of both the "volume" *and* the "distinct traders"
across these agent tokens is the **same handful of actors**, not fully independent demand.
Any single agent token's apparent activity is partly ecosystem-wide MM/bot infrastructure
bleeding across every token.

### Honest re-framing (verified, don't overclaim)
Tracing `0x8f10` further: it **holds 50+ distinct ERC-20s including blue-chip BTC
wrappers (WBTC, cbBTC, LBTC, iBTC) and stablecoins** — it is a **professional,
general-purpose market-maker / arb bot**, not an agent-token-specific wash engine.
Its presence across these tokens therefore reads as an **organic positive** (the
tokens are liquid enough to attract a real MM) more than manipulation. The honest
conclusion is *concentration of market-making*, **not** *coordinated wash trading*:
- The recurring MM is legit infrastructure servicing the sector (and the wider Base market).
- The recurring funder (`0x3304e2`, a long-lived EOA since early Base) runs **multiple
  bot wallets** — a real but small-scale sybil-of-bots pattern, most visible on JUNO
  (4 wallets). Worth noting, not alarming on its own.

So: the agent-token sector leans on **shared professional MM/bot infrastructure**.
That inflates per-token "distinct trader" optics, but is a sign of real market plumbing,
not (by itself) fraud. The genuinely *suspect* token in the set is **CLANKER**, where
that MM/bot layer is **66% of all volume** — i.e. the headline volume is mostly machines.

---

## Reuse

```bash
npx tsx scripts/wash-probe.ts --token 0x<addr> [--hours 24] [--symbol SYM] [--no-trace]
```
Works for any Base ERC-20. ~60–90s per token.
