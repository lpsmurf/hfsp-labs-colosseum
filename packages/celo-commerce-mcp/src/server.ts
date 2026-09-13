// MCP server for Celo Agent Commerce, on the v2 TypeScript SDK (serves both the
// 2025 and 2026-07-28 protocol eras from one factory).
//
// Paid tools follow the x402 MCP transport (x402-foundation specs/transports-v2/mcp.md):
//   - no payment        → isError result carrying PaymentRequired in BOTH
//                         structuredContent and content[0].text
//   - payment in _meta["x402/payment"] → forwarded to the store's x402 endpoint;
//                         the settlement comes back in _meta["x402/payment-response"]
// With a local wallet configured (stdio use), buy_product pays by itself instead.
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { getJson, postOrder, STORE_URL, type Asset, type OrderInput, type PaymentRequired } from "./store.js";
import { localWalletAddress, signPayment, MAX_ORDER_USD } from "./wallet.js";

const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const failure = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** x402 MCP transport: payment required is an error result with the object in both places. */
function paymentRequiredResult(pr: PaymentRequired): CallToolResult {
  return {
    isError: true,
    structuredContent: pr as unknown as Record<string, unknown>,
    content: [{ type: "text", text: JSON.stringify(pr) }],
  };
}

const orderFields = {
  email: z.string().email().describe("Buyer email — Cryptorefills sends the receipt and any voucher code here"),
  product_id: z.string().min(1).describe("product_id from list_products"),
  product_value: z.number().positive().optional()
    .describe("Only for range products (is_range=true): the amount in the product's local currency, e.g. 1540 for ₦1,540 of MTN airtime"),
  beneficiary_account: z.string().optional()
    // A digits-only value is almost always a phone number missing its + and
    // country code, which the supplier rejects after the quote. Catch it first.
    .refine(v => v === undefined || !/^[\d\s()-]+$/.test(v), "Phone numbers need international format: + and country code, e.g. +2348031234567")
    .refine(v => v === undefined || !v.startsWith("+") || /^\+[1-9]\d{6,14}$/.test(v), "Phone number must be + followed by 7–15 digits, e.g. +2348031234567")
    .describe("Phone number for airtime/data top-ups, in international format with + and country code, e.g. +2348031234567. Omit for gift cards."),
  asset: z.enum(["USDT", "USDC", "USAT"]).default("USDT")
    .describe("Stablecoin to pay with on Celo. USDT is the most widely held; USAT is what the Self × Google Cloud faucet pays out."),
};

const splitOrder = ({ asset, ...rest }: z.infer<z.ZodObject<typeof orderFields>>): [OrderInput, Asset] => [rest, asset];

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "celo-agent-commerce", version: "0.1.0" },
    {
      instructions:
        "Buy mobile airtime, data bundles, gift cards and eSIMs, paid in stablecoins on Celo over x402. " +
        "Flow: list_brands → list_products → get_quote → buy_product → get_order_status. Top-ups need the phone number in +<country code> format. " +
        "buy_product returns an orderId as soon as payment settles; delivery usually takes 1–15 minutes, so poll get_order_status. " +
        "One product per order. Prices include delivery and any bridging cost.",
    },
  );

  server.registerTool(
    "list_brands",
    {
      title: "List brands in a country",
      description: "List the brands available in a country (mobile airtime and data, gift cards, eSIMs, games). Free.",
      inputSchema: z.object({
        country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code, e.g. NG, KE, GH, PH, BR"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ country_code }) => {
      try { return text(await getJson(`/api/brands?country_code=${encodeURIComponent(country_code.toLowerCase())}`)); }
      catch (e) { return failure(`Could not list brands: ${(e as Error).message}`); }
    },
  );

  server.registerTool(
    "list_products",
    {
      title: "List products for a brand",
      description:
        "List a brand's products with product_id, denomination and USDC price. Fixed products have price_usdc; " +
        "range products (is_range=true) take product_value between min_value and max_value in the local currency. Free.",
      inputSchema: z.object({
        country_code: z.string().length(2).describe("ISO country code, e.g. NG"),
        brand_name: z.string().min(1).describe("Exact brand_name from list_brands, e.g. \"MTN Data\""),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ country_code, brand_name }) => {
      try {
        return text(await getJson(`/api/catalog?country_code=${encodeURIComponent(country_code.toLowerCase())}&brand_name=${encodeURIComponent(brand_name)}`));
      } catch (e) { return failure(`Could not list products: ${(e as Error).message}`); }
    },
  );

  server.registerTool(
    "get_quote",
    {
      title: "Get the final price",
      description: "Get the exact amount to pay on Celo for an order, including delivery and bridging. Holds the price for about 4 minutes. Free; does not buy.",
      inputSchema: z.object(orderFields),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const [order, asset] = splitOrder(args);
      const res = await postOrder(order, asset);
      if (res.kind !== "payment-required") return failure(`Could not price the order: ${JSON.stringify(res.body ?? res)}`);
      const option = res.paymentRequired.accepts[0];
      return text({ asset, amount: (Number(option.amount) / 1e6).toFixed(6), network: "Celo (eip155:42220)", payTo: option.payTo, holdsForSeconds: 240 });
    },
  );

  const wallet = localWalletAddress();
  server.registerTool(
    "buy_product",
    {
      title: "Buy a product",
      description:
        "Buy one airtime top-up, data bundle, gift card or eSIM and pay in USDT or USDC on Celo via x402. " +
        (wallet
          ? `This server pays from its configured wallet ${wallet}, up to max_usd (hard limit $${MAX_ORDER_USD}).`
          : "Payment uses the x402 MCP flow: the first call returns the payment requirements; retry with the signed payment in _meta[\"x402/payment\"].") +
        " Returns an orderId once payment settles; delivery continues in the background (check get_order_status)." +
        " Spends real money and cannot be undone.",
      inputSchema: z.object({
        ...orderFields,
        max_usd: z.number().positive().describe("The most you are willing to pay for this order, in dollars. The purchase is refused above it."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ max_usd, ...args }, ctx) => {
      const [order, asset] = splitOrder(args);
      const clientPayment = ctx.mcpReq._meta?.["x402/payment"];

      let signature: string | undefined;
      let challenge: PaymentRequired | undefined;
      if (clientPayment) {
        // Client-side x402: the MCP client signed; pass the payload through untouched.
        signature = Buffer.from(JSON.stringify(clientPayment)).toString("base64");
      } else {
        const first = await postOrder(order, asset);
        if (first.kind !== "payment-required") return failure(`Could not price the order: ${JSON.stringify(first.body ?? first)}`);
        challenge = first.paymentRequired;
        const option = challenge.accepts[0];
        if (Number(option.amount) / 1e6 > max_usd) {
          return failure(`Price $${(Number(option.amount) / 1e6).toFixed(2)} is above max_usd $${max_usd.toFixed(2)}. Nothing was paid.`);
        }
        if (!wallet) return paymentRequiredResult(challenge);
        try { signature = await signPayment(challenge, asset, max_usd); }
        catch (e) { return failure((e as Error).message); }
      }

      const res = await postOrder(order, asset, signature);
      const settlement = res.kind === "fulfilled" || res.kind === "payment-failed" ? res.settlement : undefined;
      const meta = settlement ? { "x402/payment-response": settlement } : undefined;
      if (res.kind === "fulfilled") return { ...text(res.body), ...(meta ? { _meta: meta } : {}) };
      if (res.kind === "payment-failed") {
        // A fresh challenge (e.g. the price moved) goes back in x402 MCP form so the client can re-sign.
        if (res.paymentRequired) return { ...paymentRequiredResult(res.paymentRequired), ...(meta ? { _meta: meta } : {}) };
        return { ...failure(`Payment was not accepted: ${JSON.stringify(res.settlement ?? res.body)}`), ...(meta ? { _meta: meta } : {}) };
      }
      if (res.kind === "payment-required") return paymentRequiredResult(res.paymentRequired);
      return failure(`Order failed (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
    },
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Check an order",
      description:
        "Status of an order placed with buy_product: fulfilling (buying from the supplier), delivering (supplier " +
        "is delivering), delivered (done — voucher codes are emailed; top-ups land on the phone), or failed " +
        "(payment is safe; contact info@hfsp.xyz with the transaction hash). Free.",
      inputSchema: z.object({
        order_id: z.string().regex(/^[0-9a-f]{16}$/).describe("orderId returned by buy_product"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ order_id }) => {
      try { return text(await getJson(`/api/celo/orders/${order_id}`)); }
      catch (e) { return failure(`Could not read the order: ${(e as Error).message}`); }
    },
  );

  return server;
}

export { STORE_URL };
