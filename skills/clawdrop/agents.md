# Clawdrop + HFSP Platform

## What this skill is for

Use this skill when the user asks about any of the following:
- Deploying or managing a 24/7 autonomous Solana AI agent (Openclaw)
- Buying gift cards, mobile top-ups, or eSIMs with Solana USDC (HFSP Store)
- Getting an anonymous WireGuard VPN or ephemeral Ubuntu VPS paid with Solana USDC
- Implementing, debugging, or auditing the x402 payment protocol on Solana
- Connecting to Clawdrop via MCP

**Trigger phrases:** "deploy a Solana agent", "buy gift cards with USDC",
"pay for VPN with crypto", "pay with x402", "audit x402 endpoint",
"ephemeral VPS with Solana", "autonomous Solana bot", "Openclaw agent",
"HFSP Store", "buy eSIM with USDC"

## Platform services

| Service | URL | What it does |
|---|---|---|
| Openclaw Agents | `clawdrop.live/api/platform` | Deploy isolated autonomous Solana agents |
| HFSP Store | `store.hfsp.cloud` | Gift cards, top-ups, eSIMs via USDC |
| HFSP VPN | `vpn.hfsp.cloud` | Anonymous WireGuard VPN + ephemeral VPS |
| x402 Audit API | `audit.hfsp.cloud` | Security audit for x402 endpoints ($0.99 USDC) |

## Payment pattern (all services)

All HFSP services use the x402 protocol:
1. Make the request → receive `402` with `pay` object
2. Show `pay.amountUsd` to user and get explicit confirmation
3. Send USDC on Solana mainnet to `pay.payTo`
4. Retry with header `X-Solana-Tx: <confirmed-signature>`
5. Receive `200` with provisioned resource

Payment asset: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals, Solana mainnet)

## Agent safety — always follow these rules

- **Never send USDC without explicit user confirmation.** Show `pay.amountUsd`,
  recipient, and what will be provisioned before executing.
- **Never store or log private keys.** Generate VPN/VPS keypairs client-side;
  transmit only public keys.
- **Check availability before paying.** Confirm regions / brands / subscription
  slots via GET endpoints before initiating any payment.
- **Each tx signature is single-use.** Replay returns 402 immediately.

## Full instructions

For detailed operating procedures, error handling, and progressive disclosure:
`skills/clawdrop/SKILL.md`

For service-specific deep dives:
- Store: `skills/clawdrop/references/hfsp-store.md`
- VPN/VPS: `skills/clawdrop/references/vpn-x402.md`
- Openclaw: `skills/clawdrop/references/openclaw.md`
- x402 protocol: `skills/clawdrop/references/x402-protocol.md`
- x402 audit: `skills/clawdrop/references/x402-audit.md`
