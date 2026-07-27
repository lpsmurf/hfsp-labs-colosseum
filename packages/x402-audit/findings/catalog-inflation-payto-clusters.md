# Audit Finding: Marketplace catalog diversity is inflated by single-operator multi-listings

**Date:** 2026-06-06
**Auditor:** HFSP Labs
**Severity:** INFO (ecosystem integrity / metric reliability — not a vulnerability)
**Type:** catalog-inflation / sybil-listing
**Method:** group every probed service by its on-chain `payTo` address (from the 402 `accepts[].payTo`)

---

## Summary

A large share of the x402 marketplace's "distinct services" resolve to a small number
of wallets. In the P4 tier alone (428 services probed), **121 services (28%) settle to
just 12 `payTo` addresses** — i.e. ~28% of that tier is one of a dozen operators
publishing many listings each. Catalog headline counts ("1,099 services / 744 active")
therefore overstate the number of independent providers.

This is not an attack and not necessarily abusive — but anyone using the catalog size
as a measure of ecosystem breadth (investors, the marketplace itself, downstream
agents choosing "diverse" providers) should discount for it.

---

## Largest single-wallet clusters (P4 tier)

| # services | payTo | Pattern |
|-----------:|-------|---------|
| 44 | `0x50ab2018c06c6E4eAA9BA52057Eb55eD284912fc` | `*pulse.vercel.app` — homepulse, taxpulse, vetpulse, marketpulse, legalpulse, … (one template, 44 topical skins) |
| 33 | `0x6E8B64638b24C6D625b045dD353120d850064E2E` | `*.api.klymax402.com` — mixes "intel" APIs (whale-alert, liquidation-oracle, hyperliquid-whales) with filler utilities (lorem-ipsum, uuid-generator, qr-code, base64-codec) |
| 8 | `0xFFc458dB291b4ABcE020fE3de4f91F2770E537b1` | payapi.market + mirrored railway deployments (company/finance/vehicle/weather) |
| 8 | `0x749B7b7A6944d72266Be9500FC8C221B6A7554Ce` | recoup-* — many Vercel **preview/branch** deployments of one app counted as separate services |
| 5 | `0x04b563909fdAFEACE9cba26f1848141bd140D741` | `*.wdh.sh` — charts/md/files/short/qr (one toolbox) |
| 4 | `0x60c402878EfcEcAe5733A88075328Aa2320C39BE` | agent-* onrender (security-gateway, budget-guard, memory-api, evolution-engine) |
| 4 | `0xbAf31935ED514e8F7da81D0A730AB5362DEEEEb7` | recoup-* preview deployments (second wallet) |
| 4 | `0xfEE13309251B632317ea2d475d6ABa7E7E0219e6` | x402-cybercentry-* railway (web/quantum/private-data/wallet verification) |
| 3 | `0xB40a687ca5483Ebc02F870348f6e08971Cae1308` | onchainintel.net + promptqualityscore (probe/pqs) |
| 3 | `0xe682Dc3c6B79c1C87Dfd17E5e25b1a07834B9f5D` | agentspec / depscout / circle-agent-readiness |
| 3 | `0x318A4B4764eb37c3FCBcE434713128143815FD57` | `*.waltsoft.net` — costpulse/threatpulse/shieldform |
| 2 | `0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57` | Wolfram\|Alpha listed twice (canonical + paysponge proxy) |

> **121 services → 12 wallets** (28% of the 428-service P4 tier).

---

## Notable sub-patterns

1. **Template farms (`*pulse`, `klymax402`).** Dozens of near-identical endpoints differing
   only by topic label, one wallet. The klymax402 set is telling: serious-sounding intel
   products sit beside throwaway dev utilities (`lorem-ipsum`, `uuid-generator`) on the
   same wallet — a single operator spraying listings to occupy catalog space.

2. **Preview deployments counted as services (`recoup-*`).** Vercel git-branch preview URLs
   (`recoup-api-git-sweetmantech-myc-3550-…vercel.app`) are each listed as a distinct
   service. These are CI artifacts, not independent providers — pure count inflation.

3. **Proxy double-listing (Wolfram|Alpha).** The same upstream appears as both a canonical
   listing and a `paysponge` proxy on one wallet — legitimate, but double-counts.

---

## Why it matters

- **Diversity metrics are unreliable.** "744 active services" is not 744 independent
  operators. In P4, the real operator count is dramatically lower than the listing count.
- **Agent provider-selection can be fooled.** An agent told to "pick 5 *different* providers
  for redundancy" may unknowingly pick 5 endpoints behind one wallet/host → no real
  redundancy (correlated downtime, single point of failure, single party sees all traffic).
- **Ranking/abuse surface.** Catalog space and any usage-weighted ranking can be gamed by
  bulk-publishing templated listings.

---

## Recommendation (for the marketplace operator)

- De-duplicate or cluster listings by `payTo` (and by host) in catalog counts; surface a
  "distinct operators" figure alongside "distinct services."
- Filter obvious preview/branch deployment URLs from the public catalog.
- Optionally flag wallets with N+ listings for review.

---

## Reproduce

The clustering is emitted by the security probe itself (`payToCollisions` in each report):

```bash
npx tsx scripts/security-probe.ts --tier p4 --limit 500
# → see "payTo collisions" block + reports/security-p4-<date>.json .payToCollisions
```
