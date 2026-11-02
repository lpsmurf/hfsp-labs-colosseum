/**
 * De-vigging: converting a bookmaker's odds into a fair (no-vig) probability.
 *
 * A bookmaker's implied probabilities sum to >1; the excess is the "vig" /
 * overround. Pinnacle's overround is small (~1–3%), which is why its no-vig
 * line is the gold-standard fair-value estimate. Ported from polysharp.
 */

/** Decimal odds -> raw implied probability (still contains vig). */
export function decimalToImplied(decimalOdds: number): number {
  if (decimalOdds <= 1) throw new Error(`Invalid decimal odds: ${decimalOdds}`);
  return 1 / decimalOdds;
}

/** Proportional ("multiplicative") de-vig — returns fair probs summing to 1. */
export function devigProportional(decimalOddsList: number[]): number[] {
  const raw = decimalOddsList.map(decimalToImplied);
  const overround = raw.reduce((a, b) => a + b, 0);
  if (overround <= 0) throw new Error("Non-positive overround");
  return raw.map((p) => p / overround);
}

/** 2-way convenience: fair probability of the FIRST outcome. */
export function devigTwoWay(decimalA: number, decimalB: number): number {
  const [pA] = devigProportional([decimalA, decimalB]);
  return pA!;
}

/** Closing Line Value (%) in probability space. Positive = better than close. */
export function clvPct(entryProb: number, closingProb: number): number {
  if (closingProb <= 0) return 0;
  return (closingProb / entryProb - 1) * 100;
}
