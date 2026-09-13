// Cryptorefills API client.
// Phase 1 (get payment requirements) and Phase 2 (fulfill with signed payment).
// Catalog endpoints are public and free — no payment needed.
import env from "../config.js";

const CR_HOST = env.CR_HOST;
const CR_API  = `${CR_HOST}/v1`;
// A hung upstream call must not stall the serial fulfilment queue. Phase 2 gets
// longer: it settles our signed payment, and cutting it short sends the order to
// reconciliation even if the purchase went through.
const TIMEOUT_MS = 20_000;
const SETTLE_TIMEOUT_MS = 90_000;

export interface CrPaymentAccept {
  scheme:            string;
  network:           string;
  maxAmountRequired?: string;  // v1 field
  amount?:           string;   // v2 field
  asset:             string;
  payTo:             string;
  extra:             Record<string, string>;
  maxTimeoutSeconds?: number;
}

export interface CrPaymentRequired {
  x402Version: number;
  accepts:     CrPaymentAccept[];
}

export interface CrPhase1Result {
  paymentRequired: CrPaymentRequired;
  sessionId:       string;
  crAmount:        bigint;  // atomic USDC units (6 decimals)
}

export interface CrOrderBody {
  email:         string;
  items:         CrOrderItem[];
  callback_url?: string;
  network?:      "solana" | "base";
}

export interface CrOrderItem {
  product_id:           string;
  product_value?:       number;
  beneficiary_account?: string;
}

// ── Catalog (public, no auth) ──────────────────────────────────────────────

export async function getBrands(countryCode: string) {
  const res = await fetch(`${CR_API}/brands?country_code=${encodeURIComponent(countryCode)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`CR brands error: ${res.status}`);
  return res.json();
}

export async function getCatalog(countryCode: string, brandName: string) {
  const url = `${CR_API}/catalog?country_code=${encodeURIComponent(countryCode)}&brand_name=${encodeURIComponent(brandName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`CR catalog error: ${res.status}`);
  return res.json();
}

// ── Orders ─────────────────────────────────────────────────────────────────

// Phase 1: call Cryptorefills to get their exact payment requirements.
// No payment happens here — just negotiation.
// body.network pins the settlement chain: "solana" (SPL USDC) or "base" (EIP-3009 USDC).
/** The supplier refused the order itself (below minimum, out of stock, bad number…). */
export class OrderRejected extends Error {
  constructor(readonly status: number, readonly reason: string, text: string) {
    super(`CR Phase 1 expected 402, got ${status}: ${text.slice(0, 200)}`);
  }
}

const SUPPLIER_REASONS: Record<string, string> = {
  AMOUNT_LESS_THEN_MINIMUM_ALLOWED: "This product is below the supplier's minimum order (about €0.50). Pick a larger amount.",
  OUT_OF_STOCK: "This product or amount is not available right now. For airtime, check the amount is within the product's range.",
};

export const rejectionMessage = (e: OrderRejected) => SUPPLIER_REASONS[e.reason] ?? "The supplier refused this order. Check the product, amount and phone number.";

// Cryptorefills requires beneficiary_account on every item. Top-ups use the phone
// number; for gift cards and eSIMs it is the buyer's email, so default to that.
const withBeneficiary = (body: CrOrderBody): CrOrderBody => ({
  ...body,
  items: body.items.map(item => ({ ...item, beneficiary_account: item.beneficiary_account ?? body.email })),
});

export async function crPhase1(body: CrOrderBody): Promise<CrPhase1Result> {
  const res = await fetch(`${CR_API}/orders`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    method: "POST",
    headers: {
      "Content-Type":       "application/json",
      "X-Preferred-Network": body.network ?? "solana",
    },
    body: JSON.stringify(withBeneficiary(body)),
  });

  if (res.status !== 402) {
    const text = await res.text();
    if (res.status >= 400 && res.status < 500) {
      // The upstream nests the supplier's JSON inside an escaped message string.
      const reason = text.replace(/\\/g, "").match(/"detail"\s*:\s*"([A-Z_]+)"/)?.[1] ?? "REJECTED";
      throw new OrderRejected(res.status, reason, text);
    }
    throw new Error(`CR Phase 1 expected 402, got ${res.status}: ${text.slice(0, 200)}`);
  }

  const prHeader = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
  if (!prHeader) throw new Error("CR Phase 1: missing PAYMENT-REQUIRED header");

  const sessionId = res.headers.get("X-Session-Id") ?? res.headers.get("x-session-id") ?? "";
  let pr: CrPaymentRequired;
  try {
    pr = JSON.parse(Buffer.from(prHeader, "base64").toString("utf8"));
  } catch (err: any) {
    throw new Error(`CR Phase 1: invalid PAYMENT-REQUIRED header: ${err?.message ?? err}`);
  }

  // Support both v1 (maxAmountRequired) and v2 (amount) field names
  const accept = pr.accepts?.[0];
  if (!accept) throw new Error("CR Phase 1: empty accepts array");
  const rawAmount = accept.amount ?? accept.maxAmountRequired;
  if (!rawAmount) throw new Error("CR Phase 1: no amount in accept");

  let crAmount: bigint;
  try {
    crAmount = BigInt(rawAmount);
  } catch (err: any) {
    throw new Error(`CR Phase 1: invalid amount in accept: ${rawAmount} (${err?.message ?? err})`);
  }

  return {
    paymentRequired: pr,
    sessionId,
    crAmount,
  };
}

// Phase 2: submit the signed payment to Cryptorefills.
// paymentSigHeader is the base64url-encoded PAYMENT-SIGNATURE JSON.
export async function crPhase2(body: CrOrderBody, sessionId: string, paymentSigHeader: string) {
  const headers: Record<string, string> = {
    "Content-Type":       "application/json",
    "PAYMENT-SIGNATURE":  paymentSigHeader,
    "X-Preferred-Network": body.network ?? "solana",
  };
  if (sessionId) headers["X-Session-Id"] = sessionId;

  const res = await fetch(`${CR_API}/orders`, {
    signal: AbortSignal.timeout(SETTLE_TIMEOUT_MS),
    method: "POST",
    headers,
    body: JSON.stringify(withBeneficiary(body)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CR Phase 2 failed ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

// Poll order status
export async function getOrder(orderId: string) {
  const res = await fetch(`${CR_API}/orders/${encodeURIComponent(orderId)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "X-Preferred-Network": "solana" },
  });
  if (!res.ok) throw new Error(`CR getOrder ${orderId} failed: ${res.status}`);
  return res.json();
}
