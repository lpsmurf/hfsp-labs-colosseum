# celo-commerce-mcp

MCP server for buying mobile airtime, data bundles, gift cards and eSIMs, paid in USDT or USDC on Celo over [x402](https://github.com/x402-foundation/x402). Built on the MCP TypeScript SDK v2, so it serves both the 2025 protocol and 2026-07-28.

## Tools

| Tool | Cost | What it does |
|---|---|---|
| `list_brands` | free | Brands in a country (`NG`, `KE`, `GH`, `PH`, `BR`, …) |
| `list_products` | free | A brand's products, with `product_id` and price |
| `get_quote` | free | The exact Celo amount for one order, including delivery and bridging |
| `buy_product` | paid | Buys one product. You must pass `max_usd`, and nothing is paid above it |

Phone numbers must be in international format (`+2348031234567`). Numbers without `+` are rejected before a price is locked.

## Paying

- **Stdio with a local wallet.** Set `CELO_BUYER_PRIVATE_KEY`, and `buy_product` pays on its own. Each order is capped by `max_usd` and by `MAX_ORDER_USD` (default `10`).
- **x402 MCP transport.** Without a wallet, `buy_product` returns an `isError` result carrying `PaymentRequired` in `structuredContent` and `content[0].text`. Retry with the signed payload in `_meta["x402/payment"]`. The receipt comes back in `_meta["x402/payment-response"]`.

## Run

```bash
# stdio (Claude Desktop, Claude Code, Cursor…)
npx tsx src/index.ts

# Streamable HTTP at /mcp. Refuses to start if CELO_BUYER_PRIVATE_KEY is set.
MCP_HTTP_PORT=3010 MCP_ALLOWED_HOSTS=mcp.example.com npx tsx src/index.ts
```

Claude Code:

```bash
claude mcp add celo-commerce -e MAX_ORDER_USD=5 -e CELO_BUYER_PRIVATE_KEY=0x… -- npx tsx /path/to/src/index.ts
```

## Environment

| Variable | Default | |
|---|---|---|
| `STORE_URL` | `https://store.hfsp.cloud` | Store API that prices, settles and fulfils |
| `CELO_BUYER_PRIVATE_KEY` | — | Local payer (stdio only) |
| `MAX_ORDER_USD` | `10` | Hard per-order cap for the local payer |
| `CELO_RPC_URL` | `https://forno.celo.org` | |
| `INTEGRATOR_ID` | — | Your ERC-8004 agent id, sent as `x-integrator` for revenue share |
| `MCP_HTTP_PORT` / `MCP_HTTP_HOST` / `MCP_ALLOWED_HOSTS` | — / `127.0.0.1` / — | HTTP mode |

Orders are fulfilled by Cryptorefills. Payments settle through the Celo x402 facilitator. Contact: info@hfsp.xyz
