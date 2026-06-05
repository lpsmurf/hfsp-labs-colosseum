# gnosis-card-x402

Top up a Gnosis Pay Safe with USDC from **Solana or Base** — pay via x402, receive native USDC on Gnosis Chain in ~90 seconds.

## Quick Start

```bash
cp .env.example .env
# Fill: WALLET_PUBLIC_KEY, WALLET_PRIVATE_KEY, HELIUS_API_KEY,
#       EVM_WALLET_ADDRESS, EVM_WALLET_PRIVATE_KEY
npm install
npm start   # → http://localhost:3001
```

## Get a Quote

```bash
curl "http://localhost:3001/api/card/topup/quote?amount=50&safeAddress=0xYOUR_SAFE&currency=USDC&sourceChain=solana"
```

## Top Up (x402)

```bash
# 1. Send USDC to the wallet shown in the quote
# 2. Submit with the tx signature
curl -X POST "http://localhost:3001/api/card/topup" \
  -H "X-Payment: <solana-tx-sig>" \
  -H "X-Payment-Chain: solana" \
  -H "Content-Type: application/json" \
  -d '{"amount":50,"safeAddress":"0xYOUR_SAFE","currency":"USDC","sourceChain":"solana"}'
```

## Payment Addresses

| Chain | Send USDC to |
|-------|-------------|
| Solana | `HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy` |
| Base | `0xaC140cD5570c1b91bD57Ddc00b97f1EB6035a8a2` |

## Destination Tokens (Gnosis Chain)

| Token | Address |
|-------|---------|
| USDC (native) | `0x2a22f9c3b484c3629090feed35f17ff8f88f76f0` |
| EURe | `0xcB444e90D8198415266c6a2724b7900fb12FC56E` |
| GBPe | `0x5Cb9073902F2035222B9749F8fB0c9BFe5527108` |

## Fees

- **Service fee:** 0.5% of amount
- **Bridge fee:** ~$0.03–$0.10 flat (Relay.link)

## Docs

- [User Guide](../../docs/guides/gnosis-card-user-guide.md)
- [Agent & API Reference](../../docs/guides/gnosis-card-agent-api.md)

## Contact

**info@hfsp.xyz** · [hfsp.xyz](https://hfsp.xyz)

## Support the Project

If this saved you time or fees, consider a donation:

| Chain | Address |
|-------|---------|
| **Solana** | `ALDJCQEjFeSBqd5WbECpYaKcfxfhNvpF4hxrg95x8vRL` |
| **EVM** (ETH, Base, Gnosis, Arbitrum…) | `0x002e76fEdb2014d24AB6032998BD9F406b322bDF` |
| **Bitcoin** | `bc1pt6u3cgad70w5yypdkrdphdfqzmyrvjdljqxpz7r2neday2kjtj9qh4kfyd` |

Built by [HFSP Labs](https://hfsp.xyz)
