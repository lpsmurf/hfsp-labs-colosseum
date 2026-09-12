---
name: audit-preview
description: Free security screen of a GitHub repo — returns severity counts and language coverage, no payment. Use before paying for a full scan, or when the only question is "is there anything here at all". Triggers: "quick check this repo", "anything obviously wrong", "screen before I pay", "free scan".
---

# audit-preview (T0 — free)

```bash
npx tsx scripts/audit-preview.ts https://github.com/owner/repo
```

Returns severity counts, the language coverage map, and `needsReview`. **No
titles, no locations, no fixes** — those are T1. A count tells you whether to
pay; it does not tell you what to fix.

## Always report these to the user

1. **`needsReview`** — findings below HIGH confidence. Leads, not bugs.
2. **Unanalysed languages** — Clarity and Move files are *counted but not
   analysed*. If `coverage` shows them, say so explicitly: zero findings there
   means "not checked", not "safe".
3. **Zero findings ≠ safe.** This is a 30-second file-local screen. It cannot
   find logic bugs, which is where most loss-of-funds lives.

`honestyChecks()` in `scripts/types.ts` generates all three — call it rather than
re-deriving them.

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | screen completed | report counts + caveats |
| 2 | upstream GitHub rate limit | **retryable** — the window is in `detail`; do not report as "repo is broken" |
| 1 | repo not found / private / other | report accurately; 404 means no access, not insecure |

## Do not

- Do not present a preview as an audit.
- Do not pay for T1 without showing the user the preview first, unless they
  explicitly asked to skip it.
