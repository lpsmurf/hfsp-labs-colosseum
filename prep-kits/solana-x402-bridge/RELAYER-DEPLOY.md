# RELAYER-DEPLOY.md — Multi-EVM x402 Relayer

Generalize `packages/gnosis-card-x402` (currently Solana/Base USDC → Gnosis) into a multi-EVM relayer that backs `bridge-execute` and carries the integrator fee natively.

## Role in the system
The relayer is the **execution + fee layer**, not one of the 5 quote providers. The open-source skill is a thin client; the relayer holds keys, applies the fee, and settles on the destination chain. Forking the skill can't strip the fee because it lives here.

## Endpoints (HTTP + x402)
| Method | Path | Purpose |
|---|---|---|
| GET  | `/quote`        | route + disclosed fee + ETA for (srcToken, amountIn, destChain, destToken) |
| GET  | `/targets`      | supported chains + tokens (mirror of evm-targets) |
| POST | `/execute`      | x402-paid; perform bridge/swap; returns `{sourceTx, destTx, statusId}` |
| GET  | `/status/:id`   | settlement status (poll until `settled`) |

`/execute` requires the x402 payment header (`X-Payment: <solana-tx-sig>`, `X-Payment-Chain: solana`) — reuse the exact intake flow already in `gnosis-card-x402/src/index.ts`.

## Generalize from gnosis-card-x402
1. **Chain registry** (`src/config.ts`): turn the single Gnosis target into a map keyed by chain → `{ chainId, rpcUrl, usdcAddress, finalitySeconds }`. Seed: polygon, gnosis (existing), base, arbitrum, ethereum.
2. **Settlement adapters**: factor the Gnosis settlement into a `SettlementAdapter` per destination so a new chain = new adapter. For USDC prefer **CCTP** mint on destination; for swaps delegate to Mayan/deBridge.
3. **Multi-token**: accept `srcToken`/`destToken`; for swaps return `priceImpactBps` + `minAmountOut` from the underlying provider quote.
4. **Health**: reuse `getHealthyEvmRpc()` logic server-side per destination before settling.

## Fee configuration (the monetization)
- Env: `INTEGRATOR_FEE_BPS` (default 15), `INTEGRATOR_FEE_ACCOUNT` (default HFSP wallet).
- `/quote` MUST return the fee line explicitly. Never hide it.
- Fee applied as the x402 price of `/execute`. Configurable per-integrator (Jupiter referral pattern) so partners can set their own and forkers are invited to integrate rather than strip.
- Keep total take ≤ 25 bps to stay attractive.

## Optional: register the relayer as a 6th aggregator adapter
If you want the relayer quoted alongside the 5 external providers, add an `hfsp` adapter in `scripts/providers.ts` whose `quote()` calls `GET /quote` and whose `execute()` calls `POST /execute`. It will compete on net rate like any provider, but its quote already includes the integrator fee. Keep it OUT of the "best 5 external routes" comparison shown to judges to avoid the appearance of self-dealing — surface it as "our relayer route" separately.

## Deploy
- Hosting: existing HFSP VPS (72.62.239.63) behind nginx, or containerize from `docker-compose`.
- DNS: `bridge.clawdrop.live` → relayer (Hostinger). Matches `X402_RELAYER_URL` default in `.env.example`.
- Secrets: relayer holds the EVM + Solana settlement keys (NEVER in the skill repo).
- TLS via Let's Encrypt (same pattern as clawdrop.live).

## Acceptance
- [ ] `/quote` returns correct fee-disclosed quotes for USDC bridge + a SOL→ETH swap.
- [ ] `/execute` settles a small USDC transfer to Polygon and returns both tx hashes.
- [ ] `/targets` lists ≥3 EVM chains incl. Polygon.
- [ ] Fee bps + account are env-configurable and shown in every quote.
