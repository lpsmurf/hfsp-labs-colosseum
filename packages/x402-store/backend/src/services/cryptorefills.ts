// Cryptorefills API client.
// Phase 1 (get payment requirements) and Phase 2 (fulfill with signed payment).
// Catalog endpoints are public and free — no payment needed.
import env from "../config.js";

const CR_HOST = env.CR_HOST;
const CR_API  = `${CR_HOST}/v1`;

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
  const res = await fetch(`${CR_API}/brands?country_code=${encodeURIComponent(countryCode)}`);
  if (!res.ok) throw new Error(`CR brands error: ${res.status}`);
  return res.json();
}

export async function getCatalog(countryCode: string, brandName: string) {
  const url = `${CR_API}/catalog?country_code=${encodeURIComponent(countryCode)}&brand_name=${encodeURIComponent(brandName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CR catalog error: ${res.status}`);
  return res.json();
}

// ── Orders ─────────────────────────────────────────────────────────────────

// Phase 1: call Cryptorefills to get their exact payment requirements.
// No payment happens here — just negotiation.
// network = "solana" pins to Solana SPL USDC flow.
export async function crPhase1(body: CrOrderBody): Promise<CrPhase1Result> {
  const res = await fetch(`${CR_API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type":       "application/json",
      "X-Preferred-Network": "solana",
    },
    body: JSON.stringify(body),
  });

  if (res.status !== 402) {
    const text = await res.text();
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
    "X-Preferred-Network": "solana",
  };
  if (sessionId) headers["X-Session-Id"] = sessionId;

  const res = await fetch(`${CR_API}/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
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
    headers: { "X-Preferred-Network": "solana" },
  });
  if (!res.ok) throw new Error(`CR getOrder ${orderId} failed: ${res.status}`);
  return res.json();
}
