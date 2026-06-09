# clawdrop-vpn

x402-gated anonymous HTTP proxy — pay USDC on Solana, get a time-limited session token, route traffic through the proxy.

## What It Does

Agents or users pay USDC via x402 to get a session token, then use it as an HTTP CONNECT proxy for anonymous web access.

| Tier | Price | Duration |
|---|---|---|
| 1 hour  | 0.10 USDC | Short session |
| 6 hours | 0.50 USDC | Half-day      |
| 24 hours | 1.50 USDC | Full day      |

Registered on [OOBE SAP marketplace](https://explorer.oobeprotocol.ai) for agent-to-agent discovery.

## Architecture

```
Agent pays USDC (x402) → GET /session?hours=1
Server verifies on-chain → returns session token
Agent uses token as HTTP CONNECT proxy auth
```

## Setup

```bash
npm install
cp .env.example .env
# Fill in WALLET_PUBLIC_KEY, WALLET_PRIVATE_KEY_HEX, HELIUS_API_KEY
npm run dev
# API  :8792
# Proxy :8793
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `WALLET_PUBLIC_KEY` | Yes | Solana wallet that receives USDC payments |
| `WALLET_PRIVATE_KEY_HEX` | Yes | Private key for SAP registration signing |
| `HELIUS_API_KEY` | Yes | Helius RPC for payment verification |
| `API_PORT` | No | API server port (default: 8792) |
| `PROXY_PORT` | No | HTTP CONNECT proxy port (default: 8793) |
| `PUBLIC_HOST` | No | Public hostname returned in session (default: req.hostname) |

## Usage

```bash
# 1. Get a session (pay 0.10 USDC on Solana)
curl -H "X-Payment: <tx_signature>" http://localhost:8792/session?hours=1

# 2. Use the proxy
curl --proxy http://localhost:8793 \
     --proxy-header "Proxy-Authorization: Bearer <token>" \
     https://ifconfig.me
```

## Contact

HFSP Labs · [info@hfsp.xyz](mailto:info@hfsp.xyz)
