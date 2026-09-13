// Wire-format adapters between the stock x402 SDK and Cryptorefills' endpoint.
// Pure functions, so the quirks they paper over stay pinned by tests.
//
// Observed 2026-09-13 (reported: github.com/Cryptorefills/agentic-commerce/issues/22):
//  - the 402 says x402Version 2 but its accepts are V1-shaped: `maxAmountRequired`
//    instead of `amount`, and no `maxTimeoutSeconds`;
//  - PAYMENT-SIGNATURE must be base64url of {x402Version, scheme, network, payload};
//    the SDK's standard base64 V2 PaymentPayload fails to decode.

interface Accept { amount?: string; maxAmountRequired?: string; maxTimeoutSeconds?: number }
interface Requirements { accepts: Accept[]; expiresAt?: string | number }

/**
 * Fill the V2 fields SDK 2.25 reads: `amount` (spend controls) and
 * `maxTimeoutSeconds` (EIP-3009 validBefore). The timeout comes from the
 * challenge's top-level expiresAt, clamped to 30–300 s; 300 s if absent.
 */
export function normalizeCrRequirements<T extends Requirements>(pr: T, now = Date.now()): T {
  const expiresAt = pr.expiresAt;
  const expiresMs = typeof expiresAt === "number" ? (expiresAt < 1e12 ? expiresAt * 1000 : expiresAt) : Date.parse(expiresAt ?? "");
  const secondsLeft = Number.isFinite(expiresMs) ? Math.floor((expiresMs - now) / 1000) : 300;
  return {
    ...pr,
    accepts: pr.accepts.map(a => ({
      ...a,
      amount: a.amount ?? a.maxAmountRequired,
      maxTimeoutSeconds: a.maxTimeoutSeconds ?? Math.max(30, Math.min(300, secondsLeft)),
    })),
  };
}

/** The PAYMENT-SIGNATURE value Cryptorefills decodes, around an SDK-signed payload. */
export function encodeCrPaymentSignature(signed: { payload: unknown }, network: string): string {
  const wrapper = { x402Version: 2, scheme: "exact", network, payload: signed.payload };
  return Buffer.from(JSON.stringify(wrapper)).toString("base64url");
}

/**
 * What a status endpoint may show about the supplier's order.
 *
 * Cryptorefills returns voucher codes, PINs, the beneficiary's phone or email
 * and its own order id (which alone fetches the codes from its API). Status
 * endpoints are reachable by anyone holding our order id, and a checkout order
 * id is public in on-chain calldata, so none of that ever leaves the server:
 * codes reach the buyer by email from the supplier.
 */
export function publicResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return undefined;
  const order = result as { status?: unknown; deliveries?: Array<Record<string, unknown>> };
  return {
    status: order.status,
    deliveries: (order.deliveries ?? []).map(d => ({
      brand_name: d.brand_name,
      product_name: d.product_name,
      denomination: d.denomination,
      currency: d.currency,
      country_code: d.country_code,
      delivery_type: d.delivery_type,
      delivery_state: d.delivery_state,
    })),
  };
}

