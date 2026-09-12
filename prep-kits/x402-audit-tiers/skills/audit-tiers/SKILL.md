---
name: audit-tiers
description: List the audit tiers, prices, turnaround and what each actually runs — including tiers that are not self-serve yet and why. Use when the user asks what an audit costs, what the difference between tiers is, or whether a deeper audit is available. Triggers: "what does an audit cost", "what tiers are there", "can I get a deeper audit", "what's included".
---

# audit-tiers

```bash
npx tsx scripts/audit-tiers.ts
```

Reads `GET /audit/tiers`. Never hardcode prices — they come from the server.

## The rule to state when asked

**Tiers differ by depth of analysis performed, not by which findings are
disclosed.** If a tier's engines find a critical, that tier returns it. We do not
hold findings behind a paywall.

What a higher tier sells is analysis the lower tier **did not perform**
(compiled, cross-file, fuzzed), *confirmation* of a low-confidence finding,
*coverage* of a skipped language, or a *human*.

## Unavailable tiers

T2–T4 return **501 with a `blockedOn` field**, not a 402. Report the blocker
honestly and offer `info@hfsp.xyz` — do not imply the tier can be bought today.

## Summary

| Tier | Price | Adds |
|---|---|---|
| T0 | free | severity counts, coverage map |
| T1 | $0.99 | full findings, confidence, SWC/CWE refs, fixes |
| T2 | $49 | cross-file analysis (Aderyn/Slither/Semgrep), lockfile advisories |
| T3 | quote | differential cache test, fuzzing, symbolic execution |
| T4 | quote | human review, signed report |
