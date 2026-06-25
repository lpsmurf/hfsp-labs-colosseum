import { scanMarkets } from "../data/gamma.js";
import { fetchBooks } from "../data/clob.js";
import { getFixtures, getFairProbs, normalizeName } from "../data/oddspapi.js";
import { matchMarket } from "../matching/matcher.js";
import { detectEdges } from "./edge-detector.js";
import type { EdgeSignal, FairValue } from "../types.js";

export interface PipelineResult {
  scannedMarkets: number;
  fixtures:       number;
  matched:        number;
  signals:        EdgeSignal[];
  oddsConfigured: boolean;
  generatedAt:    string;
}

/**
 * One full pass: discover markets → match to sharp fixtures → de-vig fair
 * value → read live books → compute net edge + Kelly size → rank.
 * Every stage fails closed: a market that can't be confidently priced is
 * dropped, not guessed.
 */
export async function runPipeline(): Promise<PipelineResult> {
  const [markets, fixtures] = await Promise.all([scanMarkets(), getFixtures()]);

  const signals: EdgeSignal[] = [];
  let matched = 0;

  for (const market of markets) {
    const match = matchMarket(market, fixtures);
    if (!match) continue;
    matched++;

    const probs = await getFairProbs(match.fixtureId);
    if (!probs) continue; // no sharp price → skip

    // Map each de-vigged participant probability to the Poly outcome tokenId.
    const fairValues: FairValue[] = [];
    for (const outcome of market.outcomes) {
      const pFair = probs.get(normalizeName(outcome.label));
      if (pFair === undefined) continue;
      fairValues.push({ tokenId: outcome.tokenId, pFair, confidence: match.matchConfidence });
    }
    if (fairValues.length === 0) continue;

    const books = await fetchBooks(fairValues.map((f) => f.tokenId));
    signals.push(...detectEdges(match, fairValues, books));
  }

  signals.sort((a, b) => b.netEdge - a.netEdge);

  return {
    scannedMarkets: markets.length,
    fixtures:       fixtures.length,
    matched,
    signals,
    oddsConfigured: Boolean(process.env.ODDS_API_KEY),
    generatedAt:    new Date().toISOString(),
  };
}
