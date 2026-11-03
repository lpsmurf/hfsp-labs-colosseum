import { config } from "../config.js";
import type { PolyMarket } from "../types.js";

// Polymarket Gamma market discovery. Returns liquid markets resolving within
// the configured window, with CLOB token ids mapped to each outcome.
interface GammaRaw {
  id:             string;
  slug:           string;
  question:       string;
  endDate?:       string;
  outcomes?:      string | string[];
  outcomePrices?: string | string[];
  clobTokenIds?:  string | string[];
  liquidityNum?:  number;
  liquidity?:     string;
  volumeNum?:     number;
  volume?:        string;
  closed?:        boolean;
}

function parseArr(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v) as string[]; } catch { return []; } }
  return [];
}

export interface Resolution {
  closed: boolean;
  prices: Map<string, number>; // tokenId -> resolved/last price (0..1)
}

// Fetch a single market's resolution state (for the paper-engine settler).
export async function fetchResolution(marketId: string): Promise<Resolution | null> {
  const res = await fetch(
    `${config.gammaUrl}/markets/${encodeURIComponent(marketId)}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  ).catch(() => null);
  if (!res?.ok) return null;
  const m = (await res.json().catch(() => null)) as GammaRaw | null;
  if (!m) return null;

  const tokenIds = parseArr(m.clobTokenIds);
  const priceArr = parseArr(m.outcomePrices);
  const prices = new Map<string, number>();
  tokenIds.forEach((id, i) => { const v = Number(priceArr[i]); if (Number.isFinite(v)) prices.set(id, v); });
  return { closed: Boolean(m.closed), prices };
}

export async function scanMarkets(): Promise<PolyMarket[]> {
  const now = Date.now();
  const maxMs = now + config.universe.maxDaysToResolve * 86_400_000;
  const out: PolyMarket[] = [];
  const PAGE = 100;
  const MAX_OFFSET = 6_000;

  for (let offset = 0; offset < MAX_OFFSET; offset += PAGE) {
    const res = await fetch(
      `${config.gammaUrl}/markets?closed=false&limit=${PAGE}&offset=${offset}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) },
    ).catch(() => null);
    if (!res?.ok) break;
    const page = (await res.json().catch(() => [])) as GammaRaw[];
    if (!Array.isArray(page) || page.length === 0) break;

    for (const m of page) {
      if (!m.endDate || m.closed) continue;
      const end = new Date(m.endDate).getTime();
      if (end <= now || end > maxMs) continue;

      const labels   = parseArr(m.outcomes);
      const tokenIds = parseArr(m.clobTokenIds);
      if (labels.length < 2 || labels.length !== tokenIds.length) continue;

      const liquidity = m.liquidityNum ?? parseFloat(m.liquidity ?? "0");
      if (liquidity < config.universe.minLiquidityUsd) continue;

      out.push({
        id:        String(m.id),
        slug:      m.slug,
        question:  m.question,
        endDate:   m.endDate,
        liquidity,
        volume:    m.volumeNum ?? parseFloat(m.volume ?? "0"),
        outcomes:  labels.map((label, i) => ({ label, tokenId: tokenIds[i]! })),
        url:       `https://polymarket.com/market/${m.slug}`,
      });
    }
    if (page.length < PAGE) break;
  }

  return out;
}
