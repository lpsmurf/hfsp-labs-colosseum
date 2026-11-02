// GET /openapi.json — AgentCash / pay.sh / x402scan discovery spec
import { Router } from "express";
import env from "../config.js";
import { celoEnabled } from "../celoConfig.js";

const router = Router();

const USDC_MINT  = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NETWORK    = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const BASE_URL   = env.PUBLIC_BASE_URL;

function x402Sol() {
  return {
    x402: {
      network: NETWORK,
      asset:   USDC_MINT,
      header:  "X-Solana-Tx",
      // payTo is returned dynamically in each 402 response — do not hardcode here.
      note:    "Send confirmed Solana mainnet USDC to the payTo address in the 402 response body, then retry with X-Solana-Tx: <signature>.",
    },
  };
}

const orderItemSchema = {
  type:       "object",
  required:   ["product_id"],
  properties: {
    product_id:          { type: "string", description: "Product ID from /api/catalog" },
    product_value:       { type: "number", description: "Amount in local currency for range products" },
    beneficiary_account: { type: "string", description: "Delivery email or account (if different from order email)" },
  },
};

const orderBodySchema = {
  type:       "object",
  required:   ["email", "items"],
  properties: {
    email:        { type: "string", format: "email", description: "Delivery email for the gift card / top-up" },
    items:        { type: "array", items: orderItemSchema, minItems: 1, maxItems: 10 },
    callback_url: { type: "string", format: "uri", description: "Optional webhook for delivery notification" },
  },
};

const response402 = {
  description: "Payment Required — x402 v2 challenge. PAYMENT-REQUIRED header contains base64(JSON). Pay USDC on Solana, retry with X-Solana-Tx.",
  content: {
    "application/json": {
      schema: {
        type:       "object",
        properties: {
          x402Version: { type: "integer", example: 2 },
          accepts:     { type: "array", items: { type: "object" } },
          resource:    { type: "object" },
          pay: {
            type:       "object",
            properties: {
              amount:       { type: "integer", description: "Atomic USDC units (6 decimals)" },
              amountUsd:    { type: "string",  description: "Human-readable USD amount" },
              crAmount:     { type: "integer", description: "Cryptorefills base price (atomic)" },
              crAmountUsd:  { type: "string",  description: "Cryptorefills base price (USD)" },
              commissionUsd:{ type: "string",  description: "HFSP Store commission (USD)" },
              payTo:        { type: "string",  description: "Solana wallet to send USDC to" },
              instructions: { type: "string" },
            },
          },
        },
      },
    },
  },
};

// Celo rail (x402 V2 with the exact scheme on eip155:42220). Unlike the Solana
// path, a paid call answers 202 with an order id and delivery runs in the
// background; the status route returns delivery state only — never voucher
// codes, which are emailed to the buyer.
const CELO_TOKENS = {
  USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  USAT: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
  USDC: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
};

const celoStatusResponse = {
  type: "object",
  properties: {
    ok:      { type: "boolean" },
    orderId: { type: "string" },
    status:  { type: "string", enum: ["fulfilling", "delivering", "delivered", "failed"] },
    data: {
      type: "object",
      description: "Delivery state only. Voucher codes and PINs are never returned here; they are emailed to the buyer.",
      properties: {
        status:     { type: "string" },
        deliveries: { type: "array", items: { type: "object", properties: {
          brand_name: { type: "string" }, product_name: { type: "string" }, denomination: { type: "string" },
          currency: { type: "string" }, country_code: { type: "string" }, delivery_type: { type: "string" }, delivery_state: { type: "string" },
        } } },
      },
    },
    error: { type: "string" },
  },
};

const celoPaths = {
  "/api/celo/orders": {
    post: {
      operationId: "create-celo-order",
      summary:     "Buy a gift card, top-up or eSIM, paid on Celo",
      tags:        ["Celo"],
      "x-payment-info": {
        price:     { mode: "dynamic", currency: "USD", note: "Bridging/settlement is priced into the 402 amount." },
        protocols: [{ x402: { network: "eip155:42220", scheme: "exact", assets: CELO_TOKENS,
          note: "x402 V2. Choose the asset with ?asset=USDT|USAT|USDC (default USDT). Sign the exact-scheme payment for the 402's accepts[0] and retry with PAYMENT-SIGNATURE. Gas is paid by the Celo facilitator." } }],
      },
      parameters: [{ name: "asset", in: "query", required: false, schema: { type: "string", enum: ["USDT", "USAT", "USDC"], default: "USDT" } }],
      requestBody: { required: true, content: { "application/json": { schema: orderBodySchema } } },
      responses: {
        "202": {
          description: "Payment settled. Delivery runs in the background; poll statusUrl.",
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" }, orderId: { type: "string", description: "Our order id (16 hex). Not a bearer token — the status route returns delivery state only." },
              status: { type: "string", example: "fulfilling" }, statusUrl: { type: "string" },
              payment: { type: "object", properties: { transaction: { type: "string" }, network: { type: "string" } } },
            },
          } } },
        },
        "402": { description: "x402 V2 challenge. PAYMENT-REQUIRED header carries the base64url JSON; pay the chosen Celo stablecoin and retry with PAYMENT-SIGNATURE." },
        "422": { description: "Asset unavailable for this order, or the supplier rejected it (e.g. below the €0.50 minimum)." },
        "503": { description: "Celo settlement temporarily paused (facilitator credits low)." },
      },
    },
  },
  "/api/celo/orders/{orderId}": {
    get: {
      operationId: "get-celo-order", summary: "Poll a Celo order's delivery state", tags: ["Celo"], security: [],
      parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", pattern: "^[0-9a-f]{16}$" } }],
      responses: { "200": { description: "Delivery state", content: { "application/json": { schema: celoStatusResponse } } }, "404": { description: "Order not found" } },
    },
  },
  "/api/celo/checkout/quote": {
    post: {
      operationId: "celo-checkout-quote",
      summary:     "Get a ready stablecoin transfer for wallets that cannot sign x402 (MiniPay, Valora)",
      tags:        ["Celo"], security: [],
      requestBody: { required: true, content: { "application/json": { schema: { allOf: [orderBodySchema, { type: "object", properties: { asset: { type: "string", enum: ["USDT", "USAT", "USDC"] } } }] } } } },
      responses: { "200": { description: "A transfer to sign, plus a per-order code and feeCurrency for stablecoin gas.", content: { "application/json": { schema: {
        type: "object", properties: {
          ok: { type: "boolean" }, orderId: { type: "string" }, asset: { type: "string" }, amountDisplay: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          transaction: { type: "object", properties: { chainId: { type: "integer", example: 42220 }, to: { type: "string" }, data: { type: "string" }, value: { type: "string" } } },
          feeCurrency: { type: "string", description: "Celo fee-currency adapter, so wallets with fee abstraction (MiniPay) pay gas in the stablecoin." },
        },
      } } } } },
    },
  },
  "/api/celo/checkout/confirm": {
    post: {
      operationId: "celo-checkout-confirm", summary: "Confirm a paid checkout transfer and start fulfilment", tags: ["Celo"], security: [],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["orderId", "txHash"],
        properties: { orderId: { type: "string", pattern: "^[0-9a-f]{10}$" }, txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } },
      } } } },
      responses: { "202": { description: "Payment verified; fulfilment started.", content: { "application/json": { schema: celoStatusResponse } } },
        "402": { description: "The transaction does not pay this order (wrong token, missing tag, low amount, or expired)." },
        "404": { description: "Order not found" }, "409": { description: "Not yet confirmed (retry), already used, or already paid." } },
    },
  },
  "/api/celo/checkout/{orderId}": {
    get: {
      operationId: "get-celo-checkout", summary: "Poll a checkout order's delivery state", tags: ["Celo"], security: [],
      parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", pattern: "^[0-9a-f]{10}$" } }],
      responses: { "200": { description: "Delivery state", content: { "application/json": { schema: celoStatusResponse } } }, "404": { description: "Order not found" } },
    },
  },
  "/api/celo/orders/integrators/{id}": {
    get: {
      operationId: "get-integrator-share", summary: "Read your accrued revenue share", tags: ["Celo"], security: [],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Your ERC-8004 agent id, the value you send as X-Integrator." }],
      responses: { "200": { description: "Owed total, order count and recent entries (buyer address masked).", content: { "application/json": { schema: {
        type: "object", properties: { ok: { type: "boolean" }, integrator: { type: "string" }, owedUsdc: { type: "string" }, orders: { type: "integer" }, shareBps: { type: "integer" } },
      } } } } },
    },
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title:       "HFSP Store x402 (Solana)",
    version:     "1.0.0",
    description: [
      "Gift cards, mobile top-ups, and eSIMs for AI agents. 10,500+ brands, 180+ countries.",
      "Powered by Cryptorefills. Pay USDC on Solana mainnet via x402 v2. No account, no API key.",
      `Commission: ${(env.COMMISSION_RATE * 100).toFixed(1)}% added to Cryptorefills catalog price.`,
      "Flow: 1) GET /api/brands or /api/catalog to discover products.",
      "2) POST /api/orders → 402 with pay.amount and pay.payTo.",
      `3) Send Solana mainnet USDC to pay.payTo (mint: ${USDC_MINT}).`,
      "4) Wait for confirmation, retry POST with X-Solana-Tx: <signature>.",
      "5) Receive gift card code in 200 response.",
      "6) Poll GET /api/orders/{id} until status=completed if delivery is async.",
    ].join(" "),
    contact: { email: "info@hfsp.xyz", url: "https://hfsp.xyz" },
  },
  servers: [{ url: BASE_URL }],
  security: [{ x402: [] }],
  components: {
    securitySchemes: {
      x402: {
        type:        "apiKey",
        in:          "header",
        name:        "X-Solana-Tx",
        description: "x402 v2 payment. Send confirmed Solana mainnet USDC to the address in the 402 response, then retry with X-Solana-Tx: <signature>.",
      },
    },
  },
  tags: [
    { name: "Catalog", description: "Browse brands and products (free, no payment)" },
    { name: "Orders",  description: "Place and track orders on Solana (x402 payment required)" },
    ...(celoEnabled ? [{ name: "Celo", description: "Pay on Celo in USDT/USAT/USDC over x402, plus a tagged checkout for MiniPay-style wallets" }] : []),
  ],
  paths: {
    ...(celoEnabled ? celoPaths : {}),
    "/api/brands": {
      get: {
        operationId: "get-brands",
        summary:     "List available brands for a country",
        tags:        ["Catalog"],
        security:    [],
        parameters: [{
          name:        "country_code",
          in:          "query",
          required:    true,
          schema:      { type: "string", example: "us" },
          description: "Lowercase ISO 3166-1 Alpha-2 country code (e.g. us, gb, de)",
        }],
        responses: {
          "200": {
            description: "Array of brand objects",
            content: { "application/json": { schema: {
              type:  "array",
              items: {
                type:       "object",
                properties: {
                  brand_name:   { type: "string", description: "Brand display name, use as brand_name in /api/catalog" },
                  country_code: { type: "string", description: "ISO 3166-1 Alpha-2 country code" },
                  category:     { type: "string", description: "Brand category (e.g. gaming, shopping, telecom)" },
                },
              },
            } } },
          },
        },
      },
    },
    "/api/catalog": {
      get: {
        operationId: "get-catalog",
        summary:     "List products for a brand",
        tags:        ["Catalog"],
        security:    [],
        parameters: [
          { name: "country_code", in: "query", required: true, schema: { type: "string", example: "us" } },
          { name: "brand_name",   in: "query", required: true, schema: { type: "string", example: "Amazon.com" } },
        ],
        responses: {
          "200": {
            description: "Array of products with product_id, price_usdc, is_range, etc.",
            content: { "application/json": { schema: {
              type:  "array",
              items: {
                type:       "object",
                properties: {
                  product_id:   { type: "string",  description: "Use this value in POST /api/orders items[].product_id" },
                  brand_name:   { type: "string" },
                  product_name: { type: "string" },
                  price_usdc:   { type: "number",  description: "Fixed price in USD (USDC). Null for range products." },
                  is_range:     { type: "boolean", description: "If true, pass product_value in the order body" },
                  min_value:    { type: "number",  description: "Minimum value (USD) for range products" },
                  max_value:    { type: "number",  description: "Maximum value (USD) for range products" },
                  currency:     { type: "string",  description: "Local currency code for range products" },
                  country_code: { type: "string" },
                },
              },
            } } },
          },
        },
      },
    },
    "/api/orders": {
      post: {
        operationId:  "create-order",
        summary:      "Buy a gift card, top-up, or eSIM",
        tags:         ["Orders"],
        "x-payment-info": {
          price:     { mode: "dynamic", currency: "USD", note: "Price determined by product. Check pay.amountUsd in 402 response." },
          protocols: [x402Sol()],
        },
        requestBody: {
          required: true,
          content:  { "application/json": { schema: orderBodySchema } },
        },
        responses: {
          "200": {
            description: "Order placed. May include immediate gift card delivery or order_id for polling.",
            content: {
              "application/json": {
                schema: {
                  type:       "object",
                  properties: {
                    ok:   { type: "boolean", example: true },
                    data: {
                      type:       "object",
                      properties: {
                        order_id: { type: "string", description: "Cryptorefills-issued UUID v4. Treat as a bearer token — anyone with this ID can poll the order and retrieve voucher codes. Store securely." },
                        status:                     { type: "string", enum: ["processing", "completed", "failed"] },
                        estimated_delivery_seconds: { type: "integer" },
                        poll_url:                   { type: "string" },
                        deliveries: {
                          type:  "array",
                          items: {
                            type:       "object",
                            properties: {
                              voucher_code: { type: "string" },
                              pin:          { type: "string" },
                              url:          { type: "string" },
                              brand_name:   { type: "string" },
                              product_name: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "402": response402,
        },
      },
    },
    "/api/orders/{id}": {
      get: {
        operationId: "get-order",
        summary:     "Poll order status and retrieve gift card when ready",
        tags:        ["Orders"],
        security:    [],
        parameters: [{
          name: "id", in: "path", required: true, schema: { type: "string" },
          description: "order_id from POST /api/orders response. This is a Cryptorefills UUID v4 that acts as a bearer token — keep it private.",
        }],
        responses: {
          "200": {
            description: "Order status and deliveries if completed",
            content: { "application/json": { schema: {
              type:       "object",
              properties: {
                ok:   { type: "boolean" },
                data: {
                  type:       "object",
                  properties: {
                    order_id:   { type: "string" },
                    status:     { type: "string", enum: ["processing", "completed", "failed"] },
                    deliveries: {
                      type:  "array",
                      items: {
                        type:       "object",
                        properties: {
                          voucher_code: { type: "string" },
                          pin:          { type: "string" },
                          url:          { type: "string" },
                          brand_name:   { type: "string" },
                          product_name: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            } } },
          },
          "404": { description: "Order not found" },
        },
      },
    },
  },
};

router.get("/", (_req, res) => { res.json(spec); });

export default router;
