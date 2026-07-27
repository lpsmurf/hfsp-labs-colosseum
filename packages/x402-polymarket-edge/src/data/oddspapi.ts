import { config } from "../config.js";
import { devigProportional } from "../fairvalue/devig.js";
import type { ProviderFixture } from "../types.js";

/**
 * Sharp-odds provider via oddspapi.io v4. Validated against live payloads.
 *
 * Shape:
 *   GET /sports?apiKey=                       → sport list
 *   GET /markets?apiKey=                       → market taxonomy (1x2 ids per sport)
 *   GET /fixtures?sportId=&from=&to=&apiKey=   → fixtures (from/to ≤10 days apart)
 *   GET /odds?fixtureId=&apiKey=               → bookmakerOdds[bk].markets[mid].outcomes[oid].players["0"].price
 *
 * Match-winner is the 1x2 "Full Time Result" market; outcomes are "1" (home /
 * participant1), "X" (draw), "2" (away / participant2). We de-vig the three to
 * a no-vig fair probability per side. Fails closed: anything unparseable →
 * empty/null → no fair value → no edge.
 */

// Real oddspapi sport IDs (from GET /sports).
export const SPORT_IDS: Record<string, number> = {
  soccer: 10, basketball: 11, tennis: 12, baseball: 13,
  americanFootball: 14, iceHockey: 15, mma: 20,
};

const FIXTURE_TTL = 6 * 60 * 60 * 1000;
const ODDS_TTL    = 30 * 60 * 1000;
const MARKETS_TTL = 24 * 60 * 60 * 1000;

const fixtureCache = new Map<string, { at: number; data: ProviderFixture[] }>();
const oddsCache    = new Map<string, { at: number; data: Map<string, number> | null }>();

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };
const key = () => config.oddsApiKey;

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(fc|cf|sc|afc|the|club)\b/g, " ").replace(/\s+/g, " ").trim();
}

async function getJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

// ── Market taxonomy: per-sport 1x2 market + outcome ids (cached) ───────────────
interface MwMarket { marketId: number; home: number; draw: number | null; away: number }
let _marketMap: { at: number; map: Map<number, MwMarket> } | null = null;

interface RawMarket { marketId: number; sportId: number; marketType?: string; period?: string; handicap?: number; marketName?: string; outcomes?: { outcomeId: number; outcomeName: string }[] }

async function getMarketMap(): Promise<Map<number, MwMarket>> {
  if (_marketMap && Date.now() - _marketMap.at < MARKETS_TTL) return _marketMap.map;
  const data = await getJson(`${config.oddsApiBase}/markets?apiKey=${encodeURIComponent(key())}`);
  const map = new Map<number, MwMarket>();
  if (Array.isArray(data)) {
    for (const m of data as RawMarket[]) {
      if (m.marketType !== "1x2" || m.period !== "fulltime" || (m.handicap ?? 0) !== 0) continue;
      const o = m.outcomes ?? [];
      const home = o.find((x) => x.outcomeName === "1")?.outcomeId;
      const draw = o.find((x) => x.outcomeName === "X")?.outcomeId ?? null;
      const away = o.find((x) => x.outcomeName === "2")?.outcomeId;
      if (home === undefined || away === undefined) continue;
      const existing = map.get(m.sportId);
      // prefer the lowest marketId (the primary "Full Time Result", not variants like 2Up)
      if (!existing || m.marketId < existing.marketId) map.set(m.sportId, { marketId: m.marketId, home, draw, away });
    }
  }
  _marketMap = { at: Date.now(), map };
  return map;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
interface RawFixture { fixtureId: string; participant1Name?: string; participant2Name?: string; startTime?: string; hasOdds?: boolean; sportId?: number; tournamentName?: string }

export async function getFixtures(): Promise<ProviderFixture[]> {
  if (!key()) return [];
  const days = Math.min(10, Math.max(1, config.universe.maxDaysToResolve));
  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const all: ProviderFixture[] = [];
  for (const [sport, sportId] of Object.entries(SPORT_IDS)) {
    const ck = `${sport}:${from}:${to}`;
    const cached = fixtureCache.get(ck);
    if (cached && Date.now() - cached.at < FIXTURE_TTL) { all.push(...cached.data); continue; }
    const data = await getJson(`${config.oddsApiBase}/fixtures?sportId=${sportId}&from=${from}&to=${to}&apiKey=${encodeURIComponent(key())}`);
    const rows: RawFixture[] = Array.isArray(data) ? data as RawFixture[] : [];
    const fixtures = rows
      .filter((r) => r.hasOdds && r.participant1Name && r.participant2Name)
      .map((r) => ({ fixtureId: r.fixtureId, sport, participant1: r.participant1Name!, participant2: r.participant2Name!, startTime: r.startTime ?? "" }));
    fixtureCache.set(ck, { at: Date.now(), data: fixtures });
    all.push(...fixtures);
  }
  return all;
}

// ── Fair probabilities (de-vigged 1x2) ────────────────────────────────────────
interface RawOdds {
  sportId?: number;
  bookmakerOdds?: Record<string, { suspended?: boolean; markets?: Record<string, { outcomes?: Record<string, { players?: Record<string, { price?: number; active?: boolean }> }> }> }>;
}

function priceOf(market: { outcomes?: Record<string, { players?: Record<string, { price?: number; active?: boolean }> }> } | undefined, outcomeId: number): number | null {
  const players = market?.outcomes?.[String(outcomeId)]?.players;
  if (!players) return null;
  const p = Object.values(players)[0];
  return p && p.active !== false && typeof p.price === "number" && p.price > 1 ? p.price : null;
}

/** Returns Map<normalizedParticipantName, pFair> for the two teams, or null. */
export async function getFairProbs(fixture: ProviderFixture): Promise<Map<string, number> | null> {
  if (!key()) return null;
  const cached = oddsCache.get(fixture.fixtureId);
  if (cached && Date.now() - cached.at < ODDS_TTL) return cached.data;

  const result = await computeFairProbs(fixture);
  oddsCache.set(fixture.fixtureId, { at: Date.now(), data: result });
  return result;
}

async function computeFairProbs(fixture: ProviderFixture): Promise<Map<string, number> | null> {
  const data = await getJson(`${config.oddsApiBase}/odds?fixtureId=${encodeURIComponent(fixture.fixtureId)}&apiKey=${encodeURIComponent(key())}`) as RawOdds | null;
  const sportId = data?.sportId ?? SPORT_IDS[fixture.sport];
  if (!data?.bookmakerOdds || sportId === undefined) return null;

  const mwMarkets = await getMarketMap();
  const mw = mwMarkets.get(sportId);
  if (!mw) return null;

  // Pick a bookmaker: prefer the configured/sharp one, else the first active book that has the 1x2 market.
  const preferred = (config.oddsBookmaker || "pinnacle").toLowerCase();
  const books = Object.entries(data.bookmakerOdds)
    .filter(([, b]) => !b.suspended && b.markets?.[String(mw.marketId)])
    .sort((a, b) => (a[0].toLowerCase() === preferred ? -1 : b[0].toLowerCase() === preferred ? 1 : 0));
  if (!books.length) return null;

  const market = books[0]![1].markets![String(mw.marketId)];
  const home = priceOf(market, mw.home);
  const away = priceOf(market, mw.away);
  const draw = mw.draw !== null ? priceOf(market, mw.draw) : null;
  if (home === null || away === null) return null;

  // De-vig over all available outcomes (3-way if draw present, else 2-way).
  const decimals = draw !== null ? [home, draw, away] : [home, away];
  const fair = devigProportional(decimals);
  const pHome = fair[0]!;
  const pAway = draw !== null ? fair[2]! : fair[1]!;

  const map = new Map<string, number>();
  map.set(normalizeName(fixture.participant1), pHome);
  map.set(normalizeName(fixture.participant2), pAway);
  return map;
}
