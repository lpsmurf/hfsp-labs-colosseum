import { config, totalCostBuffer } from "../config.js";
import { sizePosition } from "../sizing/kelly.js";
import type { EdgeSignal, FairValue, MatchedMarket, OrderBook } from "../types.js";

/**
 * Edge detector. For each matched market we have a fair probability per
 * outcome. We take the price we'd actually PAY to enter (best ask) and compute:
 *     rawEdge = pFair − entryPrice
 *     netEdge = rawEdge − (fees + slippage + safety)
 * A signal fires only when netEdge ≥ MIN_EDGE. We bet at ANY price level — an
 * 85¢ favorite and a 12¢ longshot are both valid IF the gap clears costs.
 * The price is not the signal; the gap is. Ported from polysharp.
 */
export function detectEdges(
  match: MatchedMarket,
  fairValues: FairValue[],
  books: Map<string, OrderBook>,
): EdgeSignal[] {
  const signals: EdgeSignal[] = [];
  const buffer = totalCostBuffer();

  for (const fv of fairValues) {
    const book = books.get(fv.tokenId);
    if (!book || book.bestAsk === null) continue;
    if (book.spread !== null && book.spread > config.universe.maxSpread) continue;

    const entryPrice = book.bestAsk;
    const rawEdge = fv.pFair - entryPrice;
    const netEdge = rawEdge - buffer;
    if (netEdge < config.universe.minEdge) continue;

    const outcome = match.market.outcomes.find((o) => o.tokenId === fv.tokenId);
    const sizing = sizePosition(fv.pFair, entryPrice);

    signals.push({
      marketId:        match.market.id,
      question:        match.market.question,
      url:             match.market.url,
      outcomeLabel:    outcome?.label ?? "(unknown)",
      tokenId:         fv.tokenId,
      entryPrice,
      pFair:           fv.pFair,
      rawEdge,
      netEdge,
      kellyStakeUsd:   Math.round(sizing.stakeUsd * 100) / 100,
      kellyShares:     Math.round(sizing.shares * 100) / 100,
      matchConfidence: match.matchConfidence,
      fairConfidence:  fv.confidence,
      endDate:         match.market.endDate,
      ts:              Date.now(),
    });
  }

  return signals.sort((a, b) => b.netEdge - a.netEdge);
}
