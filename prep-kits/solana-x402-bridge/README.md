# solana-x402-bridge

**The Jupiter of cross-chain for Solana agents.** Aggregate every bridge, quote the best rate, optionally fund with fiat, and execute on any EVM chain — all from a Solana wallet.

> One-line pitch: A Solana agent that shops every cross-chain route for the best rate, can be funded by card/bank via Onramper, and executes on EVM (Polymarket betting demo).

## Why this matters

Solana agents are trapped on Solana, and the few "bridge" attempts hardcode a single route. There is **no bridge-aggregator skill** in the Solana AI Kit ecosystem. This package shops **multiple bridge providers** (Circle CCTP, Mayan, deBridge, Wormhole, Allbridge), returns the best net rate, and proves it on screen — plus an **Onramper** fiat layer for funding and cash-out.

**Solana is always the front door.** Every flow starts from a Solana wallet/agent.

## Modules

| Module | Purpose |
|---|---|
| `bridge-aggregator` | Quote N bridge providers, rank by best net rate (the headline) |
| `bridge-quote` | Returns the best external route + full per-provider comparison, plus the optional HFSP relayer route |
| `bridge-execute` | Run safety checks, choose the best provider, or prefer the HFSP relayer when configured |
| `bridge-safety` | Allowlist, spend caps, slippage, stale-RPC freshness guard, confirmation monitor |
| `evm-targets` | Supported EVM chains + tokens + provider registry |
| `fiat-onramp` | Fund with fiat / cash out via Onramper (20+ ranked providers) |
| `polymarket-read` | Read Polymarket markets, odds, positions (demo layer) |
| `polymarket-bet` | Place / redeem Polymarket bets (demo layer) |

## Demo (60s)

```bash
# "Bet 5 USDC that <event> resolves YES on Polymarket"
npx tsx scripts/bridge-quote.ts USDC 5 polygon USDC   # aggregates providers -> best + comparison
npx tsx scripts/bridge-execute.ts USDC 5 polygon USDC # routes best provider, Solana -> Polygon
npx tsx scripts/polymarket.ts bet <marketId> YES 5  # bet on real market
# optional: npx tsx scripts/onramp.ts quote USD 20 solana   # fund with fiat first
```

## Status

**Prep kit / scaffold.** Full spec in `BUILD-BRIEF.md` (see §10 for the aggregation + Onramper design). The external provider comparison (CCTP, Mayan, deBridge, Wormhole, Allbridge) is a scaffold: those adapters in `scripts/providers.ts` are not implemented yet, so the aggregator currently returns no external routes. The only working route today is the HFSP x402 relayer, used when `X402_RELAYER_URL` is configured; it is surfaced separately from the external comparison.

## License

MIT
