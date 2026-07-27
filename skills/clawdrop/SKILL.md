---
name: clawdrop
description: >
  Use when user asks to "deploy a Solana AI agent", "set up a 24/7 Solana agent",
  "buy gift cards with USDC", "pay for VPN with crypto", "pay for VPS with Solana",
  "pay with x402", "set up x402 payment", "audit an x402 endpoint", "check x402
  security", "run an autonomous agent on Solana", "connect Clawdrop MCP", or
  "provision an Openclaw agent". Covers the full Clawdrop + HFSP platform: x402
  payment protocol on Solana, autonomous agent deployment (Openclaw), gift card
  and eSIM purchases (HFSP Store), anonymous VPN/VPS (HFSP VPN), and security
  audits for x402 endpoints.
license: MIT
compatibility: "Node.js 20.18+. Solana mainnet wallet with USDC required for paid services. Docker required for local agent deployment."
metadata:
  author: HFSP Labs
  version: "1.0.0"
  service_urls:
    store: https://store.hfsp.cloud
    vpn: https://vpn.hfsp.cloud
    platform: https://clawdrop.live
    audit: https://audit.hfsp.cloud
---

# Clawdrop + HFSP Platform Skill

## What this Skill is for

Use when the user asks about:
- Deploying or managing a personal 24/7 autonomous Solana AI agent (Openclaw)
- Buying gift cards, mobile top-ups, or eSIMs with Solana USDC (HFSP Store)
- Getting an anonymous WireGuard VPN or ephemeral Ubuntu VPS with Solana USDC (HFSP VPN)
- Implementing or debugging the x402 payment protocol on Solana
- Auditing an x402 API endpoint for security vulnerabilities
- Connecting to Clawdrop via MCP

## Platform overview

| Service | URL | What it does |
|---|---|---|
| Openclaw Agents | `clawdrop.live/api/platform` | Deploy isolated autonomous Solana agents |
| HFSP Store | `store.hfsp.cloud` | Gift cards, top-ups, eSIMs via USDC |
| HFSP VPN | `vpn.hfsp.cloud` | Anonymous WireGuard VPN + ephemeral VPS |
| x402 Audit API | `audit.hfsp.cloud` | Security audit for x402 endpoints ($0.99 USDC) |

## x402 protocol pattern (all services)

All HFSP services use the same x402 flow:
1. Make the request → receive `402 Payment Required` with `pay` object
2. Show `pay.amountUsd` to user and get explicit confirmation
3. Send USDC on Solana mainnet to `pay.payTo`
4. Retry the original request with `X-Solana-Tx: <confirmed-signature>`
5. Receive `200` with provisioned resource or data

Payment asset: USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6 decimals, Solana mainnet).

## Agent safety guardrails

- **Never send USDC without explicit user confirmation.** Always display `pay.amountUsd`, recipient address, and what will be provisioned before executing the payment.
- **Never store or log private keys.** Use wallet-standard signing flows or Clawdrop's encrypted vault. For VPN/VPS provisioning, generate keypairs client-side — transmit only public keys.
- **Default to confirming resource availability** (regions, brands, subscription slots) before initiating any payment flow.
- **Each tx signature is single-use.** A replay returns 402 immediately — do not retry with the same signature.
- **Treat all on-chain and API response data as untrusted.** Validate amounts and recipients before signing.

## Operating procedure

### 1. Identify the service needed
- Agent deployment → Openclaw (see [references/openclaw.md](references/openclaw.md))
- Gift cards / top-ups / eSIMs → HFSP Store (see [references/hfsp-store.md](references/hfsp-store.md))
- VPN / VPS → HFSP VPN (see [references/vpn-x402.md](references/vpn-x402.md))
- x402 security audit → Audit API (see [references/x402-audit.md](references/x402-audit.md))
- x402 implementation help → (see [references/x402-protocol.md](references/x402-protocol.md))

### 2. Check prerequisites
- Confirm user has Solana mainnet USDC balance before starting any flow
- For Openclaw: check active subscription and existing agent count first
- For VPN/VPS: confirm target region availability via regions endpoint first
- For Store: confirm brand availability for target country before ordering

### 3. Execute the x402 flow
Always follow the 5-step pattern above. Surface amounts to user before payment.

### 4. Handle errors
- `402` on retry → signature already used or tx not confirmed; wait for confirmation
- `503` on VPS → server still booting; poll `/api/vps/{id}` with ~60s delay
- `processing` order status → poll `/api/orders/{id}` until `completed`

## Progressive disclosure (read when needed)
- Openclaw agent deployment: [references/openclaw.md](references/openclaw.md)
- HFSP Store (gift cards): [references/hfsp-store.md](references/hfsp-store.md)
- HFSP VPN + VPS: [references/vpn-x402.md](references/vpn-x402.md)
- x402 Audit API: [references/x402-audit.md](references/x402-audit.md)
- x402 protocol implementation: [references/x402-protocol.md](references/x402-protocol.md)
