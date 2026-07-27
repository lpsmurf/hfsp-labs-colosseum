/**
 * keepa-client.ts — price history + drop monitoring (Arm A "watch" stage).
 *
 * Typed wrapper over the Keepa REST API. Keepa is the price-data/monitoring rail
 * (decision locked); Rainforest is a later swap behind the same PriceProvider
 * interface if we need richer live product search.
 *
 * Docs (verified 2026-06-27):
 *   - https://keepa.com/#!api
 *   - https://keepaapi.readthedocs.io/en/latest/api_methods.html  (documents the REST shape)
 *   - base: https://api.keepa.com   auth: ?key=<KEEPA_API_KEY>
 *
 * Gotchas (encoded in the helpers below):
 *   - Prices are INTEGER CENTS. -1 means "no data". -0.01-style sentinels appear
 *     as the integer -1 in the raw csv; treat any negative as "no value".
 *   - Time is "Keepa minutes" = minutes since 2011-01-01 (epoch offset below).
 *   - csv[] is indexed by type: AMAZON=0, NEW=1, USED=2, SALES=3, ... and each
 *     series is a flat [time, value, time, value, ...] array.
 *   - Tokens: each /product call costs ~1 token; tokens refill over time. Batch
 *     ASINs (comma-separated) and cache to stay under the bucket.
 */

import type { PricePoint, PriceProvider, ProductSnapshot } from "./providers.js";

const DEFAULT_BASE = "https://api.keepa.com";

/** Minutes between Unix epoch and Keepa epoch (2011-01-01T00:00:00Z). */
const KEEPA_EPOCH_OFFSET_MIN = 21564000;

/** csv series indices (subset we use). */
export const KeepaCsv = { AMAZON: 0, NEW: 1, USED: 2, SALES: 3, LISTPRICE: 4 } as const;

/** Amazon locale → Keepa domain id. */
export const KeepaDomain = { US: 1, GB: 2, DE: 3, FR: 4, JP: 5, CA: 6, IT: 8, ES: 9, IN: 10, MX: 11, BR: 12 } as const;
export type KeepaDomainName = keyof typeof KeepaDomain;

export interface KeepaConfig {
  apiKey: string;
  domain?: KeepaDomainName; // default US
  baseUrl?: string;
}

// Minimal view of the Keepa product object.
interface KeepaProduct {
  asin: string;
  title?: string;
  csv?: Array<number[] | null>;
  stats?: {
    current?: number[]; // indexed like csv; cents or -1
    min?: Array<number[] | null>; // [keepaMinute, cents] per index
  };
}
interface KeepaProductResponse {
  products?: KeepaProduct[];
  tokensLeft?: number;
  refillIn?: number;
  error?: { message?: string };
}

export function keepaMinuteToUnixMs(keepaMinute: number): number {
  return (keepaMinute + KEEPA_EPOCH_OFFSET_MIN) * 60_000;
}

/** Cents → USD; any negative sentinel (-1 / out-of-stock) becomes null. */
export function centsToUsd(cents: number): number | null {
  return cents < 0 ? null : cents / 100;
}

/** Decode a flat [time, value, ...] Keepa series into PricePoints. */
export function decodeCsvSeries(series: number[] | null | undefined): PricePoint[] {
  if (!series) return [];
  const out: PricePoint[] = [];
  for (let i = 0; i + 1 < series.length; i += 2) {
    out.push({ at: keepaMinuteToUnixMs(series[i]!), priceUsd: centsToUsd(series[i + 1]!) });
  }
  return out;
}

export class KeepaClient implements PriceProvider {
  private readonly base: string;
  private readonly domainId: number;
  constructor(private readonly config: KeepaConfig) {
    this.base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.domainId = KeepaDomain[config.domain ?? "US"];
  }

  /** Build the GET /product URL (exposed so the demo can show the call shape). */
  productUrl(asin: string): string {
    const q = new URLSearchParams({
      key: this.config.apiKey,
      domain: String(this.domainId),
      asin,
      stats: "180", // compute 180-day stats (min/max/current) — no extra token
      history: "1",
    });
    return `${this.base}/product?${q.toString()}`;
  }

  async getProduct(asin: string): Promise<ProductSnapshot> {
    const res = await fetch(this.productUrl(asin));
    if (!res.ok) throw new Error(`Keepa /product → ${res.status} ${res.statusText}`);
    const data = (await res.json()) as KeepaProductResponse;
    if (data.error?.message) throw new Error(`Keepa error: ${data.error.message}`);
    const p = data.products?.[0];
    if (!p) throw new Error(`Keepa: no product for ASIN ${asin}`);

    const newSeries = p.csv?.[KeepaCsv.NEW] ?? p.csv?.[KeepaCsv.AMAZON] ?? null;
    const history = decodeCsvSeries(newSeries);
    const currentCents = p.stats?.current?.[KeepaCsv.NEW] ?? p.stats?.current?.[KeepaCsv.AMAZON];
    const minPair = p.stats?.min?.[KeepaCsv.NEW] ?? p.stats?.min?.[KeepaCsv.AMAZON];

    return {
      asin: p.asin,
      title: p.title,
      currentUsd: currentCents === undefined ? null : centsToUsd(currentCents),
      minUsd: minPair ? centsToUsd(minPair[1]!) : null,
      history,
    };
  }

  /**
   * A price-drop watch is just: snapshot now, compare current vs a target the
   * user set (or vs the 180d min). The agent loop polls this on an interval and
   * fires an AgentMail/Telegram alert + (optionally) a guarded buy when it trips.
   */
  async isBelow(asin: string, targetUsd: number): Promise<{ tripped: boolean; snapshot: ProductSnapshot }> {
    const snapshot = await this.getProduct(asin);
    const tripped = snapshot.currentUsd !== null && snapshot.currentUsd <= targetUsd;
    return { tripped, snapshot };
  }
}
