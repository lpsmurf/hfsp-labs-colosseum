// Thin client for the Celo Agent Commerce store's HTTP API.
//
// The MCP server never settles payments itself: every purchase goes through the
// store's x402 endpoint, so pricing, price locks, replay protection and
// fulfilment live in one tested place.

export const STORE_URL = (process.env.STORE_URL ?? "https://store.hfsp.cloud").replace(/\/$/, "");
const INTEGRATOR_ID = process.env.INTEGRATOR_ID; // ERC-8004 id of whoever runs this server, for revenue share

export type Asset = "USDT" | "USDC" | "USAT";

export interface OrderInput {
  email: string;
  product_id: string;
  product_value?: number;
  beneficiary_account?: string;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: Array<{ scheme: string; network: string; amount: string; asset: string; payTo: string; maxTimeoutSeconds: number; extra?: Record<string, unknown> }>;
  extensions?: Record<string, unknown>;
}

export type OrderResponse =
  | { kind: "payment-required"; paymentRequired: PaymentRequired }
  | { kind: "payment-failed"; settlement?: unknown; paymentRequired?: PaymentRequired; body: unknown }
  | { kind: "fulfilled"; settlement?: unknown; body: unknown }
  | { kind: "error"; status: number; body: unknown };

const decode = <T>(header: string | null): T | undefined =>
  header ? JSON.parse(Buffer.from(header, "base64").toString("utf8")) as T : undefined;

export async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${STORE_URL}${path}`, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(typeof body === "object" && body && "error" in body ? String((body as any).error) : `HTTP ${res.status}`);
  return body;
}

export function orderUrl(asset: Asset): string {
  return `${STORE_URL}/api/celo/orders?asset=${asset}`;
}

export function orderBody(input: OrderInput): string {
  const item: Record<string, unknown> = { product_id: input.product_id };
  if (input.product_value !== undefined) item.product_value = input.product_value;
  if (input.beneficiary_account) item.beneficiary_account = input.beneficiary_account;
  return JSON.stringify({ email: input.email, items: [item] });
}

/**
 * POST an order. Without `paymentSignature` this prices it and returns the 402
 * challenge; with one it pays and returns the fulfilment result.
 */
export async function postOrder(input: OrderInput, asset: Asset, paymentSignature?: string): Promise<OrderResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (paymentSignature) headers["PAYMENT-SIGNATURE"] = paymentSignature;
  if (INTEGRATOR_ID) headers["X-Integrator"] = INTEGRATOR_ID;

  const res = await fetch(orderUrl(asset), { method: "POST", headers, body: orderBody(input) });
  const body = await res.json().catch(() => ({}));
  const paymentRequired = decode<PaymentRequired>(res.headers.get("payment-required"));
  const settlement = decode<unknown>(res.headers.get("payment-response"));

  if (res.status === 402 && !paymentSignature && paymentRequired) return { kind: "payment-required", paymentRequired };
  if (res.status === 402) return { kind: "payment-failed", settlement, paymentRequired, body };
  if (res.ok) return { kind: "fulfilled", settlement, body };
  return { kind: "error", status: res.status, body };
}
