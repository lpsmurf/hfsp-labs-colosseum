# solana-x402-bridge

**Cross-chain execution for Solana agents.** Move USDC from Solana to any EVM chain via the HFSP x402 relayer, then act on it — bridge, then execute.

> One-line pitch: Let a Solana agent reach EVM markets — bridge USDC to any EVM chain and act on it, all from a Solana wallet.

## Why this matters

Solana agents are trapped on Solana. The biggest markets, prediction venues, and liquidity often live on EVM chains. There is **no cross-chain asset-bridge skill** in the Solana AI Kit ecosystem today. This package gives an agent a safe, fee-transparent way to bridge USDC and execute on the other side — with Polymarket betting as the flagship demo.

**Solana is always the front door.** Every flow starts from a Solana wallet/agent; EVM is reached through the bridge.

## Modules

| Module | Purpose |
|---|---|
| `bridge-quote` | Route + transparent fee breakdown + ETA (read-only) |
| `bridge-execute` | Pay via x402, bridge, return source + dest tx |
| `bridge-safety` | Allowlist, spend caps, slippage, stale-RPC freshness guard, confirmation monitor |
| `evm-targets` | Supported EVM chains + token + endpoint registry |
| `polymarket-read` | Read Polymarket markets, odds, positions (demo layer) |
| `polymarket-bet` | Place / redeem Polymarket bets (demo layer) |

## Demo (60s)

```bash
# "Bet 5 USDC that <event> resolves YES on Polymarket"
npx tsx scripts/bridge-quote.ts 5 polygon usdc      # route + fee + ETA
npx tsx scripts/bridge-execute.ts 5 polygon usdc    # Solana -> Polygon (~45-90s)
npx tsx scripts/polymarket.ts bet <marketId> YES 5  # bet on real market
```

## Status

This is a **prep kit / scaffold**. See `BUILD-BRIEF.md` for the full implementation spec. Core bridge logic is generalized from `packages/gnosis-card-x402`.

## License

MIT
