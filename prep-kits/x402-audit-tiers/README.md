# x402-audit-tiers

**Security auditing an agent can actually buy.** Free preview, $0.99 full scan, deeper tiers priced by the work they require — all over x402, no account, no sales call.

> One-line pitch: An agent about to integrate or fund a contract can screen it for $0.99 in 30 seconds, and the report tells it honestly what it did *not* check.

## Why this matters

Agents are starting to move real money into contracts they have never read. The existing options are a $30k human audit or nothing. There is no tier in between that an autonomous agent can buy with a single payment and act on.

The gap is not just price, it is **honesty about depth**. A scanner that returns "0 findings" on a Clarity contract it has no rules for is worse than useless — it manufactures confidence. Every report here carries a per-finding `confidence`, a `coverage` map of what languages were actually analysed, and a `notAnalysed` block stating the limits of the tier that ran.

## Modules

| Module | Purpose |
|---|---|
| `audit-preview` | Free severity counts + coverage map. Decide whether to pay. |
| `audit-scan` | $0.99 USDC full findings — locations, confidence, SWC/CWE refs, fixes |
| `audit-tiers` | Catalog: what each tier runs, what it costs, what is not self-serve yet |

## What the scan covers

| Language | Engine | Rules |
|---|---|---|
| Solidity | SWC + solcurity + DeFiVulnLabs | reentrancy ordering, unchecked calls, unchecked ERC-20 returns, `tx.origin` auth, signature replay, AMM spot-price oracles, unprotected initializers, encodePacked collisions, ERC-4626 inflation |
| Solana / Anchor | sealevel-attacks | missing signer/owner checks, unconstrained accounts, PDA bump canonicalization, arbitrary CPI, account revival, sysvar spoofing, `overflow-checks` |
| Solidity / Rust / C++ | verification-cache | cache-hit short-circuits, keys that do not bind the verified object, replay guards missing context |
| JS / TS | x402 + supply chain | CORS reflection with credentials, payment-header bypass, npm lifecycle injection, shell sinks, `eval` |
| Any | secrets + advisories | hardcoded keys, OSV.dev dependency advisories, patch-age on security-critical paths |
| Clarity / Move | **none — counted only** | see `coverage`; a clean report here means "not analysed" |

## Demo (30s)

```bash
# Free: is there anything worth paying for?
npx tsx scripts/audit-preview.ts https://github.com/owner/repo
# → { critical: 1, high: 3, needsReview: 2, coverage: { solidity: 14 } }

# Paid: what and where
npx tsx scripts/audit-scan.ts https://github.com/owner/repo
# → 402 challenge → pay → full findings

# What else could I buy?
npx tsx scripts/audit-tiers.ts
```

## Reading a report without fooling yourself

```jsonc
{
  "summary": {
    "critical": 1, "high": 3, "total": 8,
    "needsReview": 2        // findings below HIGH confidence — verify these
  },
  "meta": {
    "coverage": { "solidity": 14, "clarity": 6 }   // 6 Clarity files: NOT analysed
  },
  "findings": [
    {
      "severity": "HIGH",
      "confidence": "MEDIUM",       // pattern usually is the bug; confirm context
      "refs": ["SWC-107", "CWE-252"],
      "location": "Vault.sol → withdraw()"
    }
  ],
  "notAnalysed": {
    "crossFile": "Rules are file-local: no inheritance graph...",
    "languages": ["clarity"],
    "unprovenLeads": 2
  }
}
```

Three habits: check `needsReview` before acting, check `coverage` before trusting a clean result, and read `confidence` alongside `severity`.

## Honest limits

- **Recall is unmeasured.** Precision is measured (248 OpenZeppelin contracts → 22 findings, mostly benign-but-true). How many real bugs we *miss* is not yet known — pending a run against [frontier-evals](https://github.com/openai/frontier-evals).
- **File-local only.** No type resolution, inheritance graph or call graph. That is the ceiling of the T1 approach and the reason T2 exists.
- **Logic bugs are out of reach.** Most loss-of-funds bugs are code doing exactly what it says, where what it says is wrong. No pattern rule finds that.
- **Needs a `GITHUB_TOKEN`.** One audit spends over 100 GitHub API requests; unauthenticated is capped at 60/hour. Without a token the service returns 503 after the first scan.

## Docs

- [../../x402-audit/references/service-tiers.md](../../x402-audit/references/service-tiers.md) — tier design, pricing rationale, the ethical line
- [../../x402-audit/references/auditor-toolkit.md](../../x402-audit/references/auditor-toolkit.md) — rule provenance, measured precision, deferred tools
- [../../x402-audit/references/verification-cache.md](../../x402-audit/references/verification-cache.md) — the bridge/sidechain cache bug class
- [BUILD-BRIEF.md](BUILD-BRIEF.md) — what to build next, in order
- [TEST-PLAN.md](TEST-PLAN.md) — how each tier is verified
