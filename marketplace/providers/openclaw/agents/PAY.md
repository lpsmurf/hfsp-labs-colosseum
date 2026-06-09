---
name: agents
title: "Openclaw"
description: "Deploy and manage private 24/7 autonomous Solana AI agents with built-in wallet tools, token monitoring, and DeFi capabilities. Supports Poly-managed keys or BYOK. Agents connect via MCP and run on Solana mainnet."
use_case: "Use to deploy a personal autonomous Solana agent, check agent status, list running agents, or stop an agent. Requires an active Openclaw subscription paid in SOL, USDC, or USDT."
category: ai_ml
service_url: https://clawdrop.live/api/platform
openapi:
  url: https://clawdrop.live/api/platform/openapi.json
---

Openclaw provisions isolated MCP server + autonomous agent containers per user on Solana.
Agents have access to token prices, wallet balances, recent transactions, token safety checks,
and DeFi tools via Agent Kit.

## Spend-aware usage

- Call `GET /api/platform/agents` to list running agents before deploying a new one — only one active agent per Starter subscription.
- Call `GET /api/platform/subscriptions` to check subscription status before attempting deploy.
- Use `DELETE /api/platform/agents/:id` to stop an agent before deploying a replacement.
- Prefer polling `GET /api/platform/agents/:id` over repeated list calls when waiting for deploy to complete.
