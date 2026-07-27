# 60-Second Demo: Solana → Polygon → Polymarket bet

**Narrative:** A Solana agent bets on a real Polymarket market — initiated entirely from a Solana wallet.

## Setup
- `.env` filled (Solana RPC + demo wallet, Polygon RPC + demo EVM wallet, relayer URL).
- Small amounts only (e.g. 5 USDC).

## Script
1. **Prompt:** "Bet 5 USDC that <event> resolves YES on Polymarket."
2. **Quote** — show route + transparent fee:
   ```bash
   npx tsx scripts/bridge-quote.ts 5 polygon usdc
   ```
   → `bridgeFee: 0.0075 USDC (15 bps)`, `etaSeconds: 45`.
3. **Safety preflight** — show it passing (within caps, RPC fresh, polygon allowlisted).
4. **Execute** — Solana → Polygon:
   ```bash
   npx tsx scripts/bridge-execute.ts 5 polygon usdc
   ```
   → print Solana + Polygon explorer links (~45–90s).
5. **Bet** — on a real market:
   ```bash
   npx tsx scripts/polymarket.ts bet <marketId> YES 5
   ```
   → show resulting position.
6. **Close:** "One Solana wallet. One skill. Cross-chain execution. No bridge skill like this exists in the kit."

## Judge talking points
- White space: no real cross-chain bridge skill in 158 submissions.
- Safety-first: guardrails + transparent fee on money movement.
- Solana-native front door; EVM reached through the bridge.
