# HFSP Labs — x402 Ecosystem

> **Payment-gated HTTP services for autonomous AI agents. Pay USDC on-chain, get the resource. No API keys, no accounts.**

Built on the [x402 protocol](https://x402.org) and Solana. Agents discover services, pay atomically, and receive provisioned resources — VPN configs, gift card codes, audit reports, and more.

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](package.json)

---

## x402 Services

| Package | Domain | Network | What agents buy |
|---------|--------|---------|-----------------|
| `x402-vpn-vps` | `vpn.hfsp.cloud` | Solana | Anonymous WireGuard VPN ($0.20–$7.99) + ephemeral Ubuntu VPS ($0.25–$3.99) |
| `x402-vpn-vps-base` | — | Base | Same VPN + VPS via x402.org facilitator (EVM) |
| `x402-store` | `store.hfsp.cloud` | Solana | Gift cards, mobile top-ups, eSIMs — 10,500+ brands, 180+ countries |
| `x402-donate` | — | Base | Route USDC to 10,000+ Endaoment charities |
| `x402-audit-api` | — | Base + Solana | Automated GitHub security audits for $0.99 USDC |
| `x402-wallet` | — | Solana | Agent wallet dashboard |
| `gnosis-card-x402` | — | Solana + Base | Top up Gnosis Pay Safe with USDC |
| `oobe-bounty` | Solana mainnet | Solana | Live autonomous agent — proof of x402 at scale |

---

## x402 Payment Pattern

Every service in this repo implements the same protocol:

```
1. POST /api/resource (no payment header)
   ← 402  { amount, asset: "USDC", network: "solana", payTo: "..." }

2. Agent sends USDC on Solana mainnet, gets tx signature

3. POST /api/resource
   Header: X-Solana-Tx: <confirmed_signature>
   ← 200  { ...provisioned resource... }
```

Server-side: Helius RPC verifies the tx, Redis SET NX claims the signature (replay protection), resource is provisioned.

---

## WDK Community Modules

| Package | What it does |
|---------|-------------|
| `wdk-solana-swap` | Jupiter-powered swaps on Solana |
| `wdk-tron-swap` | SunSwap swaps on Tron |

---

## Smart Contracts

| Package | What it does |
|---------|-------------|
| `gnosis-card-contracts` | Solidity contracts for Gnosis Card payment routing (Hardhat + OpenZeppelin) |

---

## Clawdrop (Private)

`packages/clawdrop-*`, `packages/trial-*`, `packages/agent-provisioning` — per-user autonomous AI agent platform. Architecture under active restructuring; not yet public.

---

## Marketplace

Registered on [pay-skills](https://github.com/solana-foundation/pay-skills) · [x402scan](https://x402scan.com)

See [`marketplace/`](marketplace/) for submission files.

---

## Security Audit

[`x402-audit/`](x402-audit/) — ongoing security research across the x402 ecosystem. Findings categorized CRITICAL → INFO.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Payment protocol | x402 v2 (`@x402/core`, `@x402/svm`, `@x402/evm`) |
| Blockchain (Solana) | `@solana/web3.js`, `@solana/spl-token`, Helius RPC |
| Blockchain (EVM) | `ethers.js`, Base, Gnosis Chain |
| Blockchain (Tron) | `tronweb` |
| Smart contracts | Hardhat + OpenZeppelin (Solidity) |
| Storage | SQLite + Redis (replay protection) |
| Infrastructure | PM2, Nginx |
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js 20+, TypeScript, Express |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — commit style, PR process, code ownership.

## License

MIT (with Commons Clause) — See [LICENSE](LICENSE)

## Contact

[info@hfsp.xyz](mailto:info@hfsp.xyz) · [hfsp.xyz](https://hfsp.xyz)

---

*Powered by the [x402 protocol](https://x402.org) and [Solana](https://solana.com).*
