# Module 3 — Bridge / sidechain runtime anomaly monitor

**Status: PIPELINE. Specced, not built. See the recommendation at the end before
committing engineering time — the honest read is that most of this is not worth
building as a product for us, and one slice of it is.**

Companion to [../references/verification-cache.md](../references/verification-cache.md).
Where that document covers the static half of the defense (which is built), this
covers the runtime half (which is not).

---

## 1. What it is

Three independent detectors plus a reconciliation daemon, watching a bridge's
live state and alerting — or tripping [Module 4](module-4-circuit-breaker.md) —
when reserves and outstanding wrapped supply stop agreeing.

The premise worth keeping in mind throughout: **the static rules can tell you a
cache looks exploitable; only reconciliation can tell you it was exploited.** A
validation bug that mints unbacked wrapped value is invisible at the transaction
level — every individual transaction validates, every signature is real, the
multisig signs correctly. The only place it shows up is in the aggregate:
locked collateral no longer covers issued supply.

That makes detector 4 (reconciliation) the one that actually matters, and
detectors 1–3 early warnings that may or may not fire.

---

## 2. Architecture

```
                      ┌──────────────────────────────────────┐
                      │          CHAIN INGEST LAYER          │
                      │                                      │
   Bitcoin full node ─┤ btc-watcher    ── blocks, UTXOs,      │
   (own, not hosted)  │                   federation addrs    │
                      │                                      │
   Liquid / sidechain ┤ side-watcher   ── blocks, peg-ins,    │
   full node          │                   peg-outs, issuance  │
                      │                                      │
   EVM / SVM RPC ─────┤ evm-watcher    ── lock/mint events    │
                      └───────────────┬──────────────────────┘
                                      │  normalized events
                                      ▼
                      ┌──────────────────────────────────────┐
                      │      EVENT STORE (TimescaleDB)        │
                      │  append-only; raw + normalized        │
                      └───────────────┬──────────────────────┘
                                      │
              ┌───────────────┬───────┴────────┬─────────────────┐
              ▼               ▼                ▼                 ▼
      ┌──────────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────────┐
      │ D1 Priming   │ │ D2 Velocity│ │ D3 Peer      │ │ D4 RESERVE     │
      │   detector   │ │  monitor   │ │  divergence  │ │ RECONCILIATION │
      └──────┬───────┘ └─────┬──────┘ └──────┬───────┘ └───────┬────────┘
             │               │                │                 │
             └───────────────┴────────┬───────┴─────────────────┘
                                      ▼
                      ┌──────────────────────────────────────┐
                      │   ALERT BUS  (severity + evidence)    │
                      └───────┬───────────────────┬──────────┘
                              ▼                   ▼
                    PagerDuty / Slack      Module 4 circuit breaker
                    (humans, slow)         (automatic, fast)
```

### Hard architectural constraint

**The reconciliation daemon must not trust the node's own view of state.** It
recomputes from raw chain data, in a separate process, ideally against a
separately-synced node. The entire premise of this bug class is that the node's
validation layer was fooled — so a monitor that asks the node "is everything
fine?" inherits the same lie. This is the single most important design decision
in the module and the easiest one to get wrong.

---

## 3. Detectors

### D1 — Priming-pattern detector

Catches the setup phase: many structurally-similar cheap transactions from one
origin cluster, followed by an outlier.

| Parameter | Start value | Notes |
|---|---|---|
| `N` similar txs | ≥ 20 | reference incident used 68 |
| window `T` | ≤ 24h | reference priming ran ~14h |
| value multiplier | ≥ 100× origin's historical mean | reference: 41 sat → 4,000 BTC |
| similarity | same script pattern + same proof structure + value within 1 order of magnitude | |

Action: flag the *outlier* for hold before settlement — not after.

**Expect this to be the noisiest detector and the easiest to evade.** Address
clustering on a confidential-transaction chain is weak by construction, and an
attacker who knows the thresholds spreads across origins or waits out the
window. Treat it as opportunistic, not as a control.

### D2 — Peg-out velocity / concentration monitor

Rolling windows on the fraction of total reserves requested for peg-out.

| Window | Threshold | Action |
|---|---|---|
| 30 min | > 3% of reserves | alert |
| 1 h | > 5% | hold pending quorum |
| 1 h | > 15% | auto-pause |
| 24 h | > 25% | auto-pause |

Reference incident: ~95% of reserves in ~28 minutes. Any of these would have
fired. The tuning question is not sensitivity, it is the false-positive cost of
pausing a legitimate large withdrawal — which is a business decision, not a
technical one, and has to be answered by the operator before the thresholds mean
anything.

### D3 — Peer divergence

Run ≥ 2 independently-configured validating nodes (different versions where
possible) and diff their accept/reject decisions and UTXO-set hashes per block.

This is the runtime twin of the differential test: **a block one node accepts
and another rejects is the signal.** It would catch a cache-poisoning bug
directly, because the poisoned node's cache state differs from a freshly-synced
peer's. Cheap, high-signal, and underrated relative to D1.

### D4 — Reserve reconciliation daemon *(the one that matters)*

Continuously recompute, from raw chain data only:

```
total_locked   = Σ UTXOs at federation-controlled addresses on the base chain
total_issued   = Σ outstanding wrapped-asset supply on the sidechain
drift          = total_issued - total_locked
```

Alert on `|drift| > tolerance` where tolerance covers fees, in-flight peg
operations and confirmation lag. Sustained positive drift means wrapped value
exists that no collateral backs — which is the exploit, regardless of whether
any individual transaction looked valid.

On a confidential-transaction chain, `total_issued` is the hard part: amounts
are blinded. It is obtainable from the issuance/reissuance records plus the
asset's blinding factors where the operator holds them, so **this detector
probably requires operator cooperation rather than being runnable purely from
public data.** That limitation shapes the market analysis below.

---

## 4. Monthly running cost

Two configurations. Assumes Hetzner/OVH-class dedicated hardware rather than
hyperscaler list price, which roughly halves the bill and is the right call for
node infrastructure.

### Lean — one bridge, one chain pair, business-hours response

| Item | Spec | USD/mo |
|---|---|---|
| Bitcoin full node | dedicated, 2 TB NVMe, 32 GB RAM | 70 |
| Sidechain full node (Liquid/Elements) | dedicated, 1 TB NVMe, 16 GB | 55 |
| Second validating node (D3 divergence) | same class, different version | 55 |
| EVM/SVM RPC (if the bridge has an EVM leg) | Helius/QuickNode growth tier | 250 |
| TimescaleDB | managed, 100 GB, daily backups | 90 |
| Detector compute | 2 × 4 vCPU/8 GB app servers | 60 |
| Object storage | raw block/snapshot archive, ~500 GB | 15 |
| Observability | Grafana Cloud paid tier | 50 |
| Alerting | PagerDuty, 3 seats | 63 |
| **Total** | | **≈ $710/mo** |

Drop the EVM RPC leg for a pure Bitcoin↔sidechain bridge and it's **≈ $460/mo**.

### Production — multi-bridge, HA, 24/7

| Item | USD/mo |
|---|---|
| Node infrastructure, 2 regions, ×2 redundancy | 500 |
| Archival RPC, business tier, multi-chain | 900 |
| TimescaleDB, HA pair + read replica | 400 |
| Detector compute, k8s node pool | 300 |
| Object storage + egress | 80 |
| Observability, higher retention | 200 |
| PagerDuty + on-call tooling | 150 |
| Secrets management / HSM for Module 4 pause authority | 200 |
| **Total infra** | **≈ $2,730/mo** |

**The infrastructure is not the expensive part.** 24/7 response on a system that
can halt a bridge needs a minimum of 3–4 engineers in rotation. Fully loaded
that is **$40k–70k/mo**, i.e. 15–25× the infra bill. Any business case that
prices this on server cost is wrong by an order of magnitude.

---

## 5. Is it worth building, and is there a market?

### Market: yes, and it is crowded and well-funded

Direct incumbents: **Hypernative**, **Hexagate** (acquired by Chainalysis),
**Forta**, **Cyvers**, **Ironblocks/Venn**, **Blockaid**, **Chaos Labs**,
**Hacken Extractor**, **Blockaid**. Several are venture-funded at scale and one
has already had an acquisition exit. This is a category with established
vendors, not a gap.

### Buyer profile: the hardest sale available to us

- **Tiny buyer pool.** Bridge operators, L2 teams, federated custodians. Tens of
  serious accounts globally, not thousands.
- **Enterprise sales cycle.** 6–12 months, security review, procurement, SOC 2
  questionnaires, references.
- **The product is trust.** You are asking an operator to let an unknown vendor
  watch — and in Module 4's case, halt — a nine-figure reserve. Reputation is the
  entire product, and we have none in bridge operations.
- **D4 needs operator cooperation** on a confidential-value chain, so we cannot
  even build a credible demo from public data alone for the case that matters.
- **24/7 obligation.** An SLA on a system that pauses bridges is an operational
  commitment on a completely different scale from a stateless scan API.

### Verdict: do not build Module 3 as a product

Wrong shape for us on every axis: crowded incumbents with funding and exits,
a handful of enterprise buyers, trust-as-product where we have no track record,
and a 24/7 staffing cost 20× the infra. The gap between "we shipped a good
scanner" and "watch our dashboard instead of Hypernative's" is not an
engineering gap.

### The one slice that *is* worth building

**D4, reconciliation, as a public proof-of-reserves dashboard — not as an
enterprise product.**

Reframed that way it inverts every disadvantage above:

- **No sale required.** Publish it. Wrapped-asset holders are the audience, not
  bridge operators, and they cannot currently verify backing themselves.
- **Reputation flows the right way.** A public dashboard that independently
  verifies wrapped-asset collateralisation is a credential we can point at, and
  it is the credential we are otherwise missing for the Stacks/x402 grant work.
- **Cheap.** No EVM RPC leg, no PagerDuty, no on-call. Roughly **$200–300/mo**
  for the chains where supply is publicly computable.
- **Monetisable without enterprise sales,** via an x402-gated API on the
  underlying data — which is exactly the business we are already in, and reuses
  `@hfsp/x402-common` rather than starting a new product line.
- **Start where amounts are public.** Most wrapped BTC and stablecoin bridges
  have transparent supply. Confidential-value chains like Liquid are the hard
  case and should be last, not first.

Being straight about the limitation: this is a *detection* good, not a
*prevention* product, and it earns reputation rather than revenue at first. But
it is the only version of Module 3 whose disadvantages we do not have to
overcome, and it is the version that watches the number that actually moves when
this bug class is exploited.

---

## 6. If it is ever built: order of work

1. **D4 on one public-supply bridge.** End to end, publishing. Proves the method.
2. **D3 peer divergence.** Cheapest high-signal detector; no operator data needed.
3. **D2 velocity.** Needs an operator relationship to set thresholds.
4. **D1 priming.** Last. Noisiest, most evadable, least valuable.
5. **Module 4.** Only with an operator who has asked for it in writing.
