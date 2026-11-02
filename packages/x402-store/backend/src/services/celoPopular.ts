// Per-country "most bought" ranking.
//
// Cryptorefills' public API exposes no sales or popularity data, so a real
// most-purchased ranking can only come from *our* delivered orders. This service
// keeps a per-country tally of the products we promote and ranks by it. Until a
// country has enough real orders it falls back to a curated shortlist, clearly
// labelled `source: "picks"` so the page never passes estimates off as sales.
//
// redis is imported lazily inside the async helpers so this module (and its pure
// rankProducts) can be unit-tested without loading config/env.

export interface PopularProduct {
  product_id: string;
  brand: string;
  category: "mobile_data" | "airtime" | "gift_card";
  get: string;        // short English description of what the buyer receives
  usdt: number;       // live-validated price in USDC/USDT
  from?: boolean;     // variable-amount product — usdt is the minimum
  count?: number;     // real delivered orders (filled by getPopular)
}

// Once a country has at least this many real delivered orders across its promoted
// products, the ranking flips from curated picks to actual most-bought.
export const MIN_REAL_ORDERS = 5;

// Curated shortlist per country, prices validated live against the catalog.
// Grouped across categories so "similar services" (e.g. rival data providers)
// show together. product_id is the real Cryptorefills id used at checkout.
export const SEED_BY_COUNTRY: Record<string, PopularProduct[]> = {
  NG: [
    { product_id: "52b23f1d-099f-4a59-81c6-689de622d66c", brand: "Airtel", category: "mobile_data", get: "3GB mobile data", usdt: 0.59 },
    { product_id: "366740f7-4df2-40dc-9bae-f7cacf2a2386", brand: "MTN",    category: "mobile_data", get: "₦750 data",       usdt: 0.59 },
    { product_id: "dcd0bb3f-1a57-40c5-86c0-3ba710317169", brand: "MTN",    category: "airtime",     get: "Airtime top-up",   usdt: 1.16, from: true },
    { product_id: "634b9012-8c6f-4500-a937-a089be83e736", brand: "Razer Gold", category: "gift_card", get: "$1 Razer Gold",  usdt: 1.12 },
  ],
  KE: [
    { product_id: "792f6037-28b0-422a-95af-fc509193cc43", brand: "Safaricom", category: "airtime", get: "Airtime, any amount", usdt: 1.16, from: true },
    { product_id: "25266277-d829-41f2-9697-f1a72364122c", brand: "Airtel",    category: "airtime", get: "Airtime, any amount", usdt: 1.16, from: true },
  ],
  GH: [
    { product_id: "ab598e78-e7bf-4873-b115-492bd803a756", brand: "AT Ghana", category: "mobile_data", get: "500MB, no expiry",   usdt: 0.66 },
    { product_id: "8757d527-208d-46d7-8a2b-825ca727f55a", brand: "MTN",      category: "mobile_data", get: "~719MB data (₵10)", usdt: 0.97 },
    { product_id: "7bd872aa-d8fd-4be4-b4b7-3a809b39140b", brand: "MTN",      category: "airtime",     get: "Airtime top-up",     usdt: 1.23, from: true },
  ],
  PH: [
    { product_id: "f568d3c0-ae32-4187-81de-f195511c677d", brand: "Smart",  category: "mobile_data", get: "All Data 50 bundle",  usdt: 0.86 },
    { product_id: "f8e21c32-52c5-43bb-8453-25a25ac53bbc", brand: "Globe",  category: "mobile_data", get: "SURF4ALL99 (₱99)",    usdt: 1.74 },
    { product_id: "43cfd1c2-0f8c-45f3-a918-a2558986108f", brand: "Lazada", category: "gift_card",   get: "₱100 voucher",         usdt: 1.80 },
  ],
  BR: [
    { product_id: "706c3f18-9eab-4014-8b1e-a4c34ac382cd", brand: "Claro",  category: "airtime",   get: "R$15 credit",     usdt: 3.20 },
    { product_id: "6adf0b12-d953-4019-aac9-24c19f91a712", brand: "Vivo",   category: "airtime",   get: "R$15 credit",     usdt: 3.32 },
    { product_id: "4af0edc3-2c5e-4ba9-b327-0151c5046b93", brand: "Shopee", category: "gift_card", get: "R$30 gift card",  usdt: 6.29 },
  ],
};

// product_id → country, so a delivered order maps back to the right tally.
const PRODUCT_COUNTRY: Record<string, string> = {};
for (const [cc, list] of Object.entries(SEED_BY_COUNTRY))
  for (const p of list) PRODUCT_COUNTRY[p.product_id] = cc;

export const SUPPORTED_COUNTRIES = Object.keys(SEED_BY_COUNTRY);

const zkey = (cc: string) => `pop:${cc}`;
const countedKey = (orderId: string) => `pop:counted:${orderId}`;
const COUNTED_TTL = 60 * 60 * 24 * 30; // 30 days

/** Pure ranking: seed ordered by real order count desc, then by seed position. */
export function rankProducts(
  seed: PopularProduct[],
  counts: Record<string, number>,
): { source: "orders" | "picks"; total: number; items: PopularProduct[] } {
  const total = seed.reduce((n, p) => n + (counts[p.product_id] || 0), 0);
  const source = total >= MIN_REAL_ORDERS ? "orders" : "picks";
  const withCounts = seed.map((p, i) => ({ ...p, count: counts[p.product_id] || 0, _i: i }));
  if (source === "orders")
    withCounts.sort((a, b) => b.count - a.count || a._i - b._i);
  return { source, total, items: withCounts.map(({ _i, ...p }) => p) };
}

/** Ranked popular products for a country. Never throws; degrades to picks. */
export async function getPopular(country: string) {
  const cc = country.toUpperCase();
  const seed = SEED_BY_COUNTRY[cc];
  if (!seed) return { country: cc, source: "picks" as const, total: 0, items: [] };
  const counts: Record<string, number> = {};
  try {
    const { redis } = await import("./redis.js");
    const flat = await redis.zrevrange(zkey(cc), 0, -1, "WITHSCORES");
    for (let i = 0; i < flat.length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
  } catch { /* redis down — fall back to picks */ }
  const { source, total, items } = rankProducts(seed, counts);
  return { country: cc, source, total, items };
}

/**
 * Record a delivered order's products against their country tallies.
 * Best-effort and idempotent per order; must never disturb fulfilment.
 */
export async function recordDelivered(orderId: string, productIds: string[]): Promise<void> {
  try {
    const { redis } = await import("./redis.js");
    const first = await redis.set(countedKey(orderId), "1", "EX", COUNTED_TTL, "NX");
    if (first !== "OK") return; // already counted this order
    for (const id of productIds) {
      const cc = PRODUCT_COUNTRY[id];
      if (cc) await redis.zincrby(zkey(cc), 1, id);
    }
  } catch { /* popularity is non-critical; swallow */ }
}
