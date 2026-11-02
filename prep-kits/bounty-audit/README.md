# bounty-audit

**Multi-provider, token-instrumented orchestration for authorized private
bug-bounty audits.** Cheap bounded agents extract and trace; expensive
agents judge; every dispatch is metered and every refusal is logged.

## Why

Single-session premium-model audits waste tokens on mechanical work (file
inventory, symbol tracing, test discovery) and under-invest where judgment
matters (root-cause equivalence, production feasibility, duplicate
analysis). This kit splits the two, and measures whether the split helps.

## Contents

| Path | Purpose |
|---|---|
| `scripts/agent-run.mjs` | Dispatch a task packet through a provider chain with refusal/rate-limit detection and fallback |
| `schemas/hypothesis.schema.json` | Candidate finding record — one JSONL line per hypothesis |
| `schemas/run-metrics.schema.json` | Per-dispatch metrics record |
| `../../.devin/agents/*.md` | Devin-native agent profiles (Tier-1 cheap, Tier-2 escalation) |
| `../../.devin/skills/bounty-audit-orchestration/` | The on-demand methodology skill |

## Providers

| Provider | Entry | Telemetry | Status |
|---|---|---|---|
| codex | `codex exec --sandbox read-only` | text only | ChatGPT-auth; quota-limited windows observed |
| claude | `claude -p --output-format json` | per-run token usage | subscription quota; weekly resets observed |
| devin | `run_subagent` explore/general | aggregate `/stats` | native; explore runs a cheap model |
| kimi | — | — | not installed; chain slot reserved |

## Dispatch

```bash
node scripts/agent-run.mjs --packet <task.md> --role <role> \
  --workdir <clean-room> --providers codex,claude --out metrics/<run-id>
```

Fallback re-sends the **identical** packet to the next provider. Refusals
still cost tokens; they are counted, not hidden.

## Safety boundary

Authorized private research only. Local testing; no live-network
interaction; no external disclosure without explicit approval. Task
packets must never contain secrets, credentials, or unrelated
target-private material.
