# x402 Ecosystem Audit

Systematic testing and bug reporting for every service listed on [agentic.market](https://agentic.market).

**Goal:** Test all x402-compatible services, document bugs and anomalies, report findings to service developers to improve the ecosystem — and earn recognition as early x402 infrastructure contributors.

---

## Structure

```
x402-audit/
├── README.md               ← this file
├── STATUS.md               ← overall audit progress tracker
├── findings/               ← one .md file per service audited
│   └── TEMPLATE.md         ← copy this to start a new finding
├── reports/                ← aggregated bug reports ready to send to devs
├── scripts/                ← automation tools
│   ├── probe.ts            ← test a single x402 endpoint
│   └── batch-probe.ts      ← batch test top services
└── archive/                ← snapshots of agentic.market catalog
    ├── services-raw-2026-06-05.json
    ├── services-enriched-2026-06-05.json
    └── services-2026-06-05.csv
```

---

## Audit Methodology

For each service:

1. **Discovery** — fetch from `api.agentic.market/v1/services`, read endpoint docs
2. **Probe** — hit endpoint without payment header → verify 402 response format
3. **Pay & call** — send real USDC, submit with `X-PAYMENT` header
4. **Verify** — check response, latency, correctness
5. **Document** — fill out `findings/<service-id>.md`
6. **Report** — open GitHub issue on their repo if bug found

### What to look for

| Category | What to check |
|----------|---------------|
| **402 format** | Does the 402 response follow x402 spec? (`x402Version`, `accepts` array, `payTo`, `network`) |
| **Payment verification** | Does it reject replayed signatures? Expired txs? Wrong amounts? |
| **Response quality** | Does paying actually return what's advertised? |
| **CORS / headers** | Are required headers present for agent use? |
| **Error messages** | Helpful or opaque? |
| **Pricing accuracy** | Does charged amount match listed amount? |
| **Network support** | Base-only vs Solana — does declared support work? |
| **Idempotency** | What happens if same signature sent twice? |
| **Timeout** | What happens if tx is older than `maxTimeoutSeconds`? |

---

## TypeSafe (Jev) shadow triage

The scanner stays the source of truth: every high-severity flag is still verified by hand.
With `--shadow`, it also asks [TypeSafe](https://typesafe.ai)'s Jev model to judge each hit (and each regex near-miss). Jev returns confirm, dismiss or review, and its verdicts are logged next to the regex result. Findings are never changed.

```bash
export TYPESAFE_API_KEY=...                          # never commit it
cd scripts
npx tsx security-probe.ts --tier p3 --limit 300 --shadow   # verdicts → eval/shadow-log.jsonl
npx tsx eval/shadow.ts todo                          # unverified checks, disagreements (⚡) first
npx tsx eval/shadow.ts label <id> real|fp "note"     # record your manual verdict
npx tsx eval/shadow.ts report                        # regex vs Jev accuracy + switch-over gate
npx tsx eval/run.ts                                  # fixed labeled regression set
```

We switch to Jev-driven triage only when `report` prints **READY**. That requires:
- at least 50 verified checks, including at least 5 real findings
- zero real findings dismissed by Jev
- no more false confirms from Jev than the regex scanner had
- no more than 20% of checks left for manual review

Response bodies are truncated and matched secrets are masked before they are sent to TypeSafe.

---

## Priority Tiers

We audit in order of ecosystem impact:

| Tier | Criteria | Count |
|------|----------|-------|
| **P1 — High impact** | >1,000 calls/30d AND many unique payers | ~20 services |
| **P2 — Growing** | 100–1,000 calls/30d | ~100 services |
| **P3 — New** | <100 calls, recently added | ~600 services |
| **Dead** | 0 calls, likely abandoned | ~355 services |

Start with P1. Full list in [`STATUS.md`](STATUS.md).

---

## Wallets for Testing

| Chain | Address | Purpose |
|-------|---------|---------|
| Solana | `HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy` | x402 payments on Solana |
| Base | `0xaC140cD5570c1b91bD57Ddc00b97f1EB6035a8a2` | x402 payments on Base |

Fund both before batch testing. Each test call costs $0.001–$0.02 USDC.

---

## Reporting to Developers

When a bug is found:

1. Find the service's GitHub repo (check their website, `providerUrl` in the catalog)
2. Open a GitHub issue using the template in `reports/github-issue-template.md`
3. Link back to our finding in `findings/<id>.md`
4. Record the issue URL in `STATUS.md`

---

## Contact

HFSP Labs · [info@hfsp.xyz](mailto:info@hfsp.xyz)
