---
name: rpc-health
description: Detect lagging or failing RPC endpoints and automatically fail over to a healthy one BEFORE executing — for Solana (slot-lag) and EVM chains (block-lag). Agents that depend on a single RPC are fragile; this swaps endpoints when the primary is stale or dead, and fails loud if none are healthy. Use for "RPC failover", "healthy RPC", "RPC is stale/lagging", "switch RPC endpoint", "RPC health check", "avoid acting on a stale RPC".
---

# rpc-health

Cross-chain RPC health switcher — a reusable utility for any Solana/EVM agent. Never act on a stale or dead RPC.

## What it does
1. Probes the primary **plus all fallbacks in parallel** (`SOLANA_FALLBACK_RPCS`, `<CHAIN>_FALLBACK_RPCS`).
2. Drops dead/timed-out endpoints (`RPC_PROBE_TIMEOUT_MS`, default 2500ms).
3. Computes **lag** vs the freshest endpoint — slot-lag (Solana), block-lag (EVM) — and rejects stale ones (`RPC_MAX_SLOT_LAG` default 150, `EVM_MAX_BLOCK_LAG` default 10).
4. Returns the healthiest endpoint (lowest lag, tie-broken by latency). **Fails loud** if none are healthy/fresh.

## Use it
- **CLI:** `tsx scripts/rpc-health.ts solana` · `tsx scripts/rpc-health.ts polygon` (API keys redacted in output)
- **Code:** `import { getHealthySolana, getHealthyEvmRpc } from "./rpc-health.js"`
- **Wired in:** `bridge-safety`'s preflight calls both before any `bridge-execute` / `auto-bridge` — so the switcher runs automatically before money moves.

## Env
```
SOLANA_RPC_URL            # primary Solana RPC
SOLANA_FALLBACK_RPCS      # comma-separated failover endpoints
<CHAIN>_RPC_URL           # e.g. POLYGON_RPC_URL
<CHAIN>_FALLBACK_RPCS     # e.g. POLYGON_FALLBACK_RPCS
RPC_MAX_SLOT_LAG=150      # max Solana slot-lag before "stale"
EVM_MAX_BLOCK_LAG=10      # max EVM block-lag before "stale"
RPC_PROBE_TIMEOUT_MS=2500 # per-endpoint probe timeout
```

## Rule
Never proceed on a stale/dead RPC. If every endpoint is unhealthy, the switcher throws — callers must block (e.g. `bridge-safety` adds it to the failures list).
