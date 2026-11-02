// Unit tests for the Celo rail's security-relevant rules. No chain, network,
// redis or configuration needed:  npm test
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { toDataSuffix } from "@celo/attribution-tags";
import { verifyCheckoutPayment, orderCode, GRACE_SECONDS, type ObservedPayment } from "../src/services/checkoutVerify.js";
import { normalizeCrRequirements, encodeCrPaymentSignature, publicResult } from "../src/services/crWire.js";
import { OrderBodySchema, AssetSchema } from "../src/routes/celoSchemas.js";
import { rankProducts, MIN_REAL_ORDERS, type PopularProduct } from "../src/services/celoPopular.js";

// ── Checkout payment verification ────────────────────────────────────────────

const TAG = "celo_4fc5832bc553";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const USAT = "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771";
const STORE = "0x9Bb10F0A8f1dBcB4F8aDA8DddE7F62B9cf90e74b";
const BUYER = "0x176b0568BcE34A8f65448313585FA46d4cF450DD";
const OTHER = "0x000000000000000000000000000000000000dEaD";
const TRANSFER = ethers.id("Transfer(address,address,uint256)");
const erc20 = new ethers.Interface(["function transfer(address to, uint256 amount)"]);

const order = { orderId: "c21df74f10", token: USDT, payTo: STORE, expiresAt: 1_800_000_000, lock: { priceAtomic: "1512008" } };

const topic = (address: string) => ethers.zeroPadValue(address, 32);
const transferLog = (from: string, to: string, amount: bigint, token = USDT) =>
  ({ address: token, topics: [TRANSFER, topic(from), topic(to)], data: ethers.toBeHex(amount, 32) });

function payment(overrides: Partial<ObservedPayment> = {}, codes = [TAG, orderCode(order.orderId)]): ObservedPayment {
  const data = erc20.encodeFunctionData("transfer", [STORE, 1_512_008n]) + toDataSuffix(codes).slice(2);
  return {
    from: BUYER, to: USDT, data, status: 1,
    logs: [transferLog(BUYER, STORE, 1_512_008n)],
    blockTimestamp: order.expiresAt - 10,
    ...overrides,
  };
}

describe("verifyCheckoutPayment", () => {
  test("accepts the exact tagged transfer", () => {
    assert.equal(verifyCheckoutPayment(order, payment(), TAG), null);
  });

  test("accepts overpayment and a transfer inside the grace period", () => {
    assert.equal(verifyCheckoutPayment(order, payment({ logs: [transferLog(BUYER, STORE, 2_000_000n)] }), TAG), null);
    assert.equal(verifyCheckoutPayment(order, payment({ blockTimestamp: order.expiresAt + GRACE_SECONDS }), TAG), null);
  });

  test("rejects a reverted transaction", () => {
    assert.match(verifyCheckoutPayment(order, payment({ status: 0 }), TAG)!, /failed on-chain/);
  });

  test("rejects a transfer of a different token", () => {
    assert.match(verifyCheckoutPayment(order, payment({ to: USAT }), TAG)!, /quoted token/);
  });

  test("rejects a transfer without this order's code or without our tag", () => {
    assert.match(verifyCheckoutPayment(order, payment({}, [TAG]), TAG)!, /reference/);
    assert.match(verifyCheckoutPayment(order, payment({}, [TAG, orderCode("aaaaaaaaaa")]), TAG)!, /reference/);
    assert.match(verifyCheckoutPayment(order, payment({}, [orderCode(order.orderId)]), TAG)!, /reference/);
    assert.match(verifyCheckoutPayment(order, payment({ data: "0xa9059cbb" }), TAG)!, /reference/);
  });

  test("trusts the Transfer event, not the calldata", () => {
    // Calldata says 1.512008 but only 1 atomic unit moved.
    assert.match(verifyCheckoutPayment(order, payment({ logs: [transferLog(BUYER, STORE, 1n)] }), TAG)!, /quoted amount/);
    assert.match(verifyCheckoutPayment(order, payment({ logs: [] }), TAG)!, /quoted amount/);
  });

  test("rejects transfers to someone else, from someone else, or emitted by another contract", () => {
    assert.match(verifyCheckoutPayment(order, payment({ logs: [transferLog(BUYER, OTHER, 1_512_008n)] }), TAG)!, /quoted amount/);
    assert.match(verifyCheckoutPayment(order, payment({ logs: [transferLog(OTHER, STORE, 1_512_008n)] }), TAG)!, /quoted amount/);
    assert.match(verifyCheckoutPayment(order, payment({ logs: [transferLog(BUYER, STORE, 1_512_008n, USAT)] }), TAG)!, /quoted amount/);
  });

  test("rejects payment after the quote and grace period, or with no block time", () => {
    assert.match(verifyCheckoutPayment(order, payment({ blockTimestamp: order.expiresAt + GRACE_SECONDS + 1 }), TAG)!, /expired/);
    assert.match(verifyCheckoutPayment(order, payment({ blockTimestamp: undefined }), TAG)!, /expired/);
  });
});

// ── Cryptorefills wire format ────────────────────────────────────────────────

describe("normalizeCrRequirements", () => {
  const v1Shaped = {
    x402Version: 2,
    expiresAt: new Date(1_000_000 + 120_000).toISOString(),
    accepts: [{ scheme: "exact", network: "eip155:8453", maxAmountRequired: "590000" }],
  };

  test("copies maxAmountRequired into amount and derives the timeout from expiresAt", () => {
    const out = normalizeCrRequirements(v1Shaped, 1_000_000);
    assert.equal(out.accepts[0].amount, "590000");
    assert.equal(out.accepts[0].maxTimeoutSeconds, 120);
  });

  test("keeps values the supplier did send", () => {
    const out = normalizeCrRequirements({ accepts: [{ amount: "1", maxAmountRequired: "2", maxTimeoutSeconds: 60 }] });
    assert.equal(out.accepts[0].amount, "1");
    assert.equal(out.accepts[0].maxTimeoutSeconds, 60);
  });

  test("clamps the timeout to 30–300 seconds and defaults to 300", () => {
    assert.equal(normalizeCrRequirements({ ...v1Shaped, expiresAt: new Date(1_000_000 + 3_600_000).toISOString() }, 1_000_000).accepts[0].maxTimeoutSeconds, 300);
    assert.equal(normalizeCrRequirements({ ...v1Shaped, expiresAt: new Date(1_000_000 - 5_000).toISOString() }, 1_000_000).accepts[0].maxTimeoutSeconds, 30);
    assert.equal(normalizeCrRequirements({ accepts: [{ maxAmountRequired: "5" }] }).accepts[0].maxTimeoutSeconds, 300);
    assert.equal(normalizeCrRequirements({ ...v1Shaped, expiresAt: 1_060 }, 1_000_000).accepts[0].maxTimeoutSeconds, 60); // unix seconds
  });
});

test("encodeCrPaymentSignature produces base64url of the minimal wrapper", () => {
  const value = encodeCrPaymentSignature({ payload: { signature: "0x" + "ff".repeat(65) } }, "eip155:8453");
  assert.match(value, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(Buffer.from(value, "base64url").toString()), {
    x402Version: 2, scheme: "exact", network: "eip155:8453", payload: { signature: "0x" + "ff".repeat(65) },
  });
});

describe("publicResult", () => {
  const supplierOrder = {
    order_id: "c5073e2a-ff32-4171-8e75-279af7d5ca99",
    status: "completed",
    email: "buyer@example.com",
    payment_transaction_hash: "0xabc",
    deliveries: [{
      brand_name: "Razer Gold IDR", product_name: "IDR10,000", denomination: "IDR10,000", currency: "IDR",
      country_code: "ID", delivery_type: "by_email", delivery_state: "completed",
      voucher_code: "SECRETCODE", pin_serial: "SECRETPIN", beneficiary_account: "+2348031234567",
    }],
  };

  test("never exposes codes, PINs, contact details or the supplier order id", () => {
    const text = JSON.stringify(publicResult(supplierOrder));
    for (const secret of ["SECRETCODE", "SECRETPIN", "+2348031234567", "buyer@example.com", "c5073e2a", "0xabc"]) {
      assert.ok(!text.includes(secret), `leaked ${secret}`);
    }
  });

  test("keeps what the buyer needs to follow delivery", () => {
    assert.deepEqual(publicResult(supplierOrder), {
      status: "completed",
      deliveries: [{
        brand_name: "Razer Gold IDR", product_name: "IDR10,000", denomination: "IDR10,000", currency: "IDR",
        country_code: "ID", delivery_type: "by_email", delivery_state: "completed",
      }],
    });
    assert.equal(publicResult(undefined), undefined);
  });
});

// ── Order input ──────────────────────────────────────────────────────────────

describe("order schemas", () => {
  const body = (beneficiary_account?: string) => ({ email: "a@b.co", items: [{ product_id: "p1", ...(beneficiary_account ? { beneficiary_account } : {}) }] });

  test("accepts E.164 phone numbers and gift cards without a beneficiary", () => {
    assert.ok(OrderBodySchema.safeParse(body("+2348031234567")).success);
    assert.ok(OrderBodySchema.safeParse(body()).success);
    assert.ok(OrderBodySchema.safeParse(body("someone@example.com")).success);
  });

  test("rejects numbers without + and country code, and malformed numbers", () => {
    assert.ok(!OrderBodySchema.safeParse(body("08031234567")).success);
    assert.ok(!OrderBodySchema.safeParse(body("+0803")).success);
  });

  test("allows exactly one item per order and only supported assets", () => {
    assert.ok(!OrderBodySchema.safeParse({ email: "a@b.co", items: [] }).success);
    assert.ok(!OrderBodySchema.safeParse({ email: "a@b.co", items: [{ product_id: "p1" }, { product_id: "p2" }] }).success);
    assert.ok(AssetSchema.safeParse("USAT").success);
    assert.ok(!AssetSchema.safeParse("cUSD").success);
  });
});

// ── Rate limiting ────────────────────────────────────────────────────────────

test("X-Real-IP is trusted only from the local proxy", async () => {
  const { clientIp } = await import("../src/middleware/celoRateLimit.js");
  const req = (peer: string, realIp?: string) => ({
    socket: { remoteAddress: peer },
    get: (name: string) => (name.toLowerCase() === "x-real-ip" ? realIp : undefined),
  }) as never;
  assert.equal(clientIp(req("127.0.0.1", "203.0.113.7")), "203.0.113.7");
  assert.equal(clientIp(req("::ffff:127.0.0.1", "203.0.113.7")), "203.0.113.7");
  assert.equal(clientIp(req("198.51.100.9", "203.0.113.7")), "198.51.100.9"); // spoofed header from outside
  assert.equal(clientIp(req("127.0.0.1")), "127.0.0.1");
});

// ── Revenue-share math ───────────────────────────────────────────────────────

test("revenueShare takes the configured cut and rounds down", async () => {
  const { revenueShare } = await import("../src/services/celoShare.js");
  assert.equal(revenueShare(10_000n, 3000n), 3000n);      // 30% of 0.01 USDC
  assert.equal(revenueShare(3_333n, 3000n), 999n);        // 999.9 → 999, never over-credit
  assert.equal(revenueShare(0n, 3000n), 0n);
  assert.equal(revenueShare(-5n, 3000n), 0n);
  assert.equal(revenueShare(1_000_000n, 10_000n), 1_000_000n); // 100%
});

// ── Cryptorefills 402 attestation ────────────────────────────────────────────

import { webcrypto, createHash } from "node:crypto";

describe("verifyAttestation", async () => {
  const { verifyAttestation, AttestationError } = await import("../src/services/crAttestation.js");
  const ORIGIN = "https://x402.cryptorefills.com";
  const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");

  // A local ES256 key stood up as the gateway's JWKS, so the test signs real tokens.
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", publicKey) as any;
  const kid = "testkid";
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) =>
    String(url).endsWith("/.well-known/x402-jwks.json")
      ? new Response(JSON.stringify({ keys: [{ kty: "EC", crv: "P-256", kid, x: jwk.x, y: jwk.y, alg: "ES256" }] }), { headers: { "content-type": "application/json" } })
      : origFetch(url)) as typeof fetch;

  const prHeader = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ payTo: "0xPay", network: "eip155:8453" }] })).toString("base64url");
  const now = 1_800_000_000_000;
  async function token(over: Record<string, unknown> = {}) {
    const claims = { iss: ORIGIN, iat: now / 1000 - 5, exp: now / 1000 + 55, sid: "sess-1",
      pr_sha256: createHash("sha256").update(prHeader, "ascii").digest("base64url"), pay_to: "0xPay", network: "eip155:8453", ...over };
    const signingInput = `${b64url(Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT", kid })))}.${b64url(Buffer.from(JSON.stringify(claims)))}`;
    const sig = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, Buffer.from(signingInput, "ascii"));
    return `${signingInput}.${b64url(new Uint8Array(sig))}`;
  }
  const base = async (over = {}, jwsOver?: string) => verifyAttestation({
    origin: ORIGIN, prHeader, sessionId: "sess-1", jws: jwsOver ?? await token(over), accept: { payTo: "0xPay", network: "eip155:8453" }, now });

  test("accepts a correctly signed attestation", async () => { await base(); });

  test("rejects a missing signature", async () => {
    await assert.rejects(verifyAttestation({ origin: ORIGIN, prHeader, sessionId: "sess-1", jws: null, accept: { payTo: "0xPay", network: "eip155:8453" }, now }), AttestationError);
  });

  test("rejects wrong issuer, expiry, session, and future iat", async () => {
    await assert.rejects(base({ iss: "https://evil.example" }), /issuer/);
    await assert.rejects(base({ exp: now / 1000 - 120 }), /expired/);
    await assert.rejects(base({ sid: "other" }), /session/);
    await assert.rejects(base({ iat: now / 1000 + 120 }), /future/);
  });

  test("rejects a payTo or network the attestation did not sign", async () => {
    await assert.rejects(base({ pay_to: "0xEvil" }), /payTo/);
    await assert.rejects(base({ network: "eip155:1" }), /network/);
  });

  test("rejects a tampered PAYMENT-REQUIRED (hash mismatch)", async () => {
    const good = await token();
    await assert.rejects(verifyAttestation({ origin: ORIGIN, prHeader: prHeader + "x", sessionId: "sess-1", jws: good, accept: { payTo: "0xPay", network: "eip155:8453" }, now }), /altered in transit/);
  });

  test("rejects a forged signature", async () => {
    const t = await token();
    const bad = t.slice(0, -6) + "AAAAAA";
    await assert.rejects(base({}, bad), AttestationError);
  });

  after(() => { globalThis.fetch = origFetch; });
});

describe("rankProducts (popularity)", () => {
  const seed: PopularProduct[] = [
    { product_id: "a", brand: "Airtel", category: "mobile_data", get: "3GB", usdt: 0.59 },
    { product_id: "b", brand: "MTN",    category: "airtime",     get: "top-up", usdt: 1.16, from: true },
    { product_id: "c", brand: "Razer",  category: "gift_card",   get: "$1",     usdt: 1.12 },
  ];

  test("falls back to curated picks below the real-order threshold", () => {
    const r = rankProducts(seed, { a: 1, b: 2 }); // total 3 < MIN_REAL_ORDERS
    assert.equal(r.source, "picks");
    assert.equal(r.total, 3);
    assert.deepEqual(r.items.map(p => p.product_id), ["a", "b", "c"]); // seed order preserved
  });

  test("ranks by real orders once the threshold is met, ties keep seed order", () => {
    const counts = { a: 1, b: 5, c: 5 }; // total 11 >= threshold
    assert.ok(11 >= MIN_REAL_ORDERS);
    const r = rankProducts(seed, counts);
    assert.equal(r.source, "orders");
    assert.deepEqual(r.items.map(p => p.product_id), ["b", "c", "a"]); // b,c tie -> seed order; a last
    assert.equal(r.items[0].count, 5);
  });

  test("does not leak the internal sort index", () => {
    const r = rankProducts(seed, {});
    assert.ok(!("_i" in (r.items[0] as any)));
  });
});
