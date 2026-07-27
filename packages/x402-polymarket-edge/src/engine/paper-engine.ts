import { config } from "../config.js";
import { clvPct } from "../fairvalue/devig.js";
import { fetchResolution } from "../data/gamma.js";
import { fetchBook } from "../data/clob.js";
import { addPosition, openPositions, updatePosition, allPositions } from "./ledger.js";
import type { CLVReport, EdgeSignal, PaperPosition } from "../types.js";

/**
 * Paper engine — records signals as pessimistic paper bets, settles them at
 * resolution, and reports CLV. CLV (not win-rate, not PnL) is the go-live gate:
 * run until ~200 settled bets and only go live if average CLV is positive.
 */

// Pessimistic fill: assume we pay slightly worse than the quoted ask.
function pessimisticEntry(price: number): number {
  return Math.min(0.999, price + config.costs.estSlippage);
}

/** Record each signal as an open paper position (one per market+outcome). */
export function recordSignals(signals: EdgeSignal[]): number {
  let added = 0;
  for (const s of signals) {
    const entry = pessimisticEntry(s.entryPrice);
    const shares = s.kellyStakeUsd > 0 && entry > 0 ? s.kellyStakeUsd / entry : 0;
    if (shares <= 0) continue;
    const pos: PaperPosition = {
      id:           `${s.marketId}:${s.tokenId}`,
      marketId:     s.marketId,
      tokenId:      s.tokenId,
      question:     s.question,
      outcomeLabel: s.outcomeLabel,
      entryPrice:   entry,
      pFair:        s.pFair,
      netEdge:      s.netEdge,
      stakeUsd:     s.kellyStakeUsd,
      shares:       Math.round(shares * 100) / 100,
      openedAt:     new Date().toISOString(),
      endDate:      s.endDate,
      status:       "open",
    };
    if (addPosition(pos)) added++;
  }
  return added;
}

/**
 * Poll open positions: snapshot the live mid (closing-line proxy), and settle
 * any that have resolved on-chain. Returns the number settled this pass.
 */
export async function resolveOpen(): Promise<number> {
  let settled = 0;
  for (const pos of openPositions()) {
    // Snapshot current mid as the rolling closing-line proxy.
    const book = await fetchBook(pos.tokenId).catch(() => null);
    const mid =
      book && book.bestBid !== null && book.bestAsk !== null
        ? (book.bestBid + book.bestAsk) / 2
        : book?.bestAsk ?? book?.bestBid ?? undefined;
    if (mid !== undefined) updatePosition(pos.id, { lastMid: mid });

    const resolution = await fetchResolution(pos.marketId).catch(() => null);
    if (!resolution || !resolution.closed) continue;

    const resolvedPrice = resolution.prices.get(pos.tokenId);
    if (resolvedPrice === undefined) continue;

    const won = resolvedPrice >= 0.5; // resolved token settles to ~1 (win) or ~0 (loss)
    const closingPrice = pos.lastMid ?? mid ?? resolvedPrice;
    const pnlUsd = (won ? pos.shares * 1 : 0) - pos.stakeUsd;

    updatePosition(pos.id, {
      status:       won ? "won" : "lost",
      closingPrice,
      clvPct:       clvPct(pos.entryPrice, closingPrice),
      pnlUsd:       Math.round(pnlUsd * 100) / 100,
      settledAt:    new Date().toISOString(),
    });
    settled++;
  }
  return settled;
}

export function report(): CLVReport {
  const all = allPositions();
  const settled = all.filter((p) => p.status === "won" || p.status === "lost");
  const wins = settled.filter((p) => p.status === "won").length;
  const losses = settled.filter((p) => p.status === "lost").length;
  const voids = all.filter((p) => p.status === "void").length;

  const clvs = settled.map((p) => p.clvPct ?? 0);
  const avgClvPct = clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : 0;
  const totalStaked = settled.reduce((a, p) => a + p.stakeUsd, 0);
  const totalPnlUsd = settled.reduce((a, p) => a + (p.pnlUsd ?? 0), 0);
  const roiPct = totalStaked > 0 ? (totalPnlUsd / totalStaked) * 100 : 0;

  let verdict: string;
  if (settled.length < 200) verdict = `Need ~200 settled bets to judge (have ${settled.length}). Keep paper-trading.`;
  else if (avgClvPct > 0) verdict = `Avg CLV +${avgClvPct.toFixed(2)}% over ${settled.length} bets — edge looks real. Consider going live (small).`;
  else verdict = `Avg CLV ${avgClvPct.toFixed(2)}% over ${settled.length} bets — NOT positive. Do NOT go live; no ROI number rescues negative CLV.`;

  return {
    total: all.length,
    open: all.filter((p) => p.status === "open").length,
    settled: settled.length,
    wins, losses, voids,
    winRatePct: settled.length ? (wins / settled.length) * 100 : 0,
    avgClvPct: Math.round(avgClvPct * 100) / 100,
    totalStaked: Math.round(totalStaked * 100) / 100,
    totalPnlUsd: Math.round(totalPnlUsd * 100) / 100,
    roiPct: Math.round(roiPct * 100) / 100,
    verdict,
  };
}
