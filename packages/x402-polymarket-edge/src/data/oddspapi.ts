import { config } from "../config.js";
import { devigProportional } from "../fairvalue/devig.js";
import type { ProviderFixture } from "../types.js";

/**
 * Sharp-odds provider (Pinnacle no-vig fair value) via oddspapi.io v4.
 *
 * The exact payload shape varies by plan/endpoint, so every parser here is
 * defensive: anything it can't confidently read returns empty / null, which
 * makes the whole pipeline FAIL CLOSED (no fair value → no edge → no signal).
 * That is the correct safety posture for money software — never guess a price.
 *
 * NOTE: tighten parseFixtures / parseFairProbs against real free-tier payloads
 * before relying on signals (same gate polysharp documents).
 */

export const SPORT_IDS: Record<string, number> = {
  soccer: 10, basketball: 11, tennis: 13, mma: 22,
};

const FIXTURE_TTL = 12 * 60 * 60 * 1000;
const ODDS_TTL    = 60 * 60 * 1000;

const fixtureCache = new Map<string, { at: number; data: ProviderFixture[] }>();
const oddsCache    = new Map<string, { at: number; data: Map<string, number> | null }>();

function key(): string { return config.oddsApiKey; }

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(fc|cf|sc|afc|the)\b/g, " ").replace(/\s+/g, " ").trim();
}

async function getJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
interface RawFixture { fixtureId?: string; id?: string; participant1Name?: string; participant2Name?: string; home?: string; away?: string; startTime?: string; commence_time?: string }

function parseFixtures(data: unknown, sport: string): ProviderFixture[] {
  const rows: RawFixture[] = Array.isArray(data) ? data as RawFixture[] : ((data as { data?: RawFixture[] })?.data ?? []);
  const out: ProviderFixture[] = [];
  for (const r of rows) {
    const id = r.fixtureId ?? r.id;
    const p1 = r.participant1Name ?? r.home;
    const p2 = r.participant2Name ?? r.away;
    const start = r.startTime ?? r.commence_time;
    if (!id || !p1 || !p2) continue;
    out.push({ fixtureId: String(id), sport, participant1: p1, participant2: p2, startTime: start ?? "" });
  }
  return out;
}

export async function getFixtures(): Promise<ProviderFixture[]> {
  if (!key()) return [];
  const all: ProviderFixture[] = [];
  for (const [sport, sportId] of Object.entries(SPORT_IDS)) {
    const cached = fixtureCache.get(sport);
    if (cached && Date.now() - cached.at < FIXTURE_TTL) { all.push(...cached.data); continue; }
    const data = await getJson(`${config.oddsApiBase}/fixtures?sportId=${sportId}&apiKey=${encodeURIComponent(key())}`);
    const fixtures = data ? parseFixtures(data, sport) : [];
    fixtureCache.set(sport, { at: Date.now(), data: fixtures });
    all.push(...fixtures);
  }
  return all;
}

// ── Fair probabilities (de-vigged Pinnacle moneyline) ─────────────────────────
// Returns Map<normalizedParticipantName, pFair>, or null if unparseable.
function parseFairProbs(data: unknown): Map<string, number> | null {
  // Expected (oddspapi v4): bookmakerOdds.pinnacle.markets.<moneyline>.outcomes
  //   .<outcomeKey>.players.<name>.price (decimal). Defensive throughout.
  const root = data as { bookmakerOdds?: Record<string, { markets?: Record<string, { outcomes?: Record<string, { players?: Record<string, { price?: number; active?: boolean }> }> }> }> } | null;
  const pinnacle = root?.bookmakerOdds?.pinnacle ?? root?.bookmakerOdds?.["pinnacle"];
  if (!pinnacle?.markets) return null;

  // Find a moneyline / match-winner style market (2- or 3-way).
  const market = pinnacle.markets["moneyline"] ?? pinnacle.markets["matchWinner"] ?? Object.values(pinnacle.markets)[0];
  if (!market?.outcomes) return null;

  const labels: string[] = [];
  const decimals: number[] = [];
  for (const outcome of Object.values(market.outcomes)) {
    for (const [name, p] of Object.entries(outcome.players ?? {})) {
      if (p.active === false || typeof p.price !== "number" || p.price <= 1) continue;
      labels.push(normalizeName(name));
      decimals.push(p.price);
    }
  }
  if (labels.length < 2) return null;

  const fair = devigProportional(decimals);
  const map = new Map<string, number>();
  labels.forEach((l, i) => map.set(l, fair[i]!));
  return map;
}

export async function getFairProbs(fixtureId: string): Promise<Map<string, number> | null> {
  if (!key()) return null;
  const cached = oddsCache.get(fixtureId);
  if (cached && Date.now() - cached.at < ODDS_TTL) return cached.data;
  const data = await getJson(`${config.oddsApiBase}/odds?fixtureId=${encodeURIComponent(fixtureId)}&apiKey=${encodeURIComponent(key())}`);
  const probs = data ? parseFairProbs(data) : null;
  oddsCache.set(fixtureId, { at: Date.now(), data: probs });
  return probs;
}
