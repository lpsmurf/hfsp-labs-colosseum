import { normalizeName } from "../data/oddspapi.js";
import type { MatchedMarket, PolyMarket, ProviderFixture } from "../types.js";

/**
 * Fail-closed matcher: map a Polymarket market to a sharp fixture.
 *
 * A match requires BOTH fixture participants to appear in the market question
 * (or outcome labels). No match → no MatchedMarket → no bet. We never guess.
 * Ported in spirit from polysharp's fail-closed matcher.
 */
function tokenOverlap(haystack: string, needle: string): boolean {
  const hs = ` ${normalizeName(haystack)} `;
  const words = normalizeName(needle).split(" ").filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  // Require the distinctive (longest) word of the participant name to appear.
  const distinctive = words.sort((a, b) => b.length - a.length)[0]!;
  return hs.includes(` ${distinctive} `) || hs.includes(distinctive);
}

export function matchMarket(market: PolyMarket, fixtures: ProviderFixture[]): MatchedMarket | null {
  const hay = `${market.question} ${market.outcomes.map((o) => o.label).join(" ")}`;
  let best: MatchedMarket | null = null;

  for (const fx of fixtures) {
    const p1 = tokenOverlap(hay, fx.participant1);
    const p2 = tokenOverlap(hay, fx.participant2);
    if (!p1 || !p2) continue; // fail closed: need both teams present

    // Confidence: full-name containment scores higher than single-word.
    const conf =
      (hay.toLowerCase().includes(fx.participant1.toLowerCase()) ? 0.5 : 0.35) +
      (hay.toLowerCase().includes(fx.participant2.toLowerCase()) ? 0.5 : 0.35);

    if (!best || conf > best.matchConfidence) {
      best = { market, fixtureId: fx.fixtureId, matchConfidence: Math.min(1, conf) };
    }
  }
  return best;
}
