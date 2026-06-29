# buyer-seller-local — runnable proof

Stands up a real `@hfsp/x402-sdk` seller and runs a buyer agent through the full
**discover → lint → rank → challenge → (pay → consume)** loop.

```bash
npm install
npm run demo
```

Offline (default): everything except the on-chain settle runs deterministically —
discovery from `/.well-known/x402`, commerce-lint gating, net-cost ranking, and a
**real 402 challenge** parsed from the SDK.

Full settle (optional): export a funded **devnet** wallet and an RPC URL, then the
buyer actually pays and consumes the paid route:

```bash
export SOLANA_SECRET_KEY='[12,34,...]'   # funded devnet keypair, JSON array
export HELIUS_RPC_URL='https://devnet.helius-rpc.com/?api-key=...'
npm run demo
```
