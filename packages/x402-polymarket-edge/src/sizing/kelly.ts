import { config } from "../config.js";

/**
 * Fractional-Kelly position sizing. Ported from polysharp.
 *
 * On a binary contract priced at `price` (cost per share, pays $1 if it
 * resolves YES) with true win probability `pFair`:
 *   net odds on a win  b = (1 - price) / price
 *   Kelly fraction    f* = (b·p − (1−p)) / b
 * Scaled by KELLY_FRACTION (quarter-Kelly default), clamped to MAX_POSITION_PCT.
 * Sizing IS the stop: max loss = stake, fixed at entry, never sold into bad
 * liquidity.
 */
export interface SizingResult {
  stakeUsd:    number;
  shares:      number;
  kellyRaw:    number;
  kellyScaled: number;
  cappedBy:    "kelly" | "max_position" | "none";
}

export function sizePosition(
  pFair: number,
  price: number,
  bankrollUsd: number = config.risk.bankrollUsd,
): SizingResult {
  const zero: SizingResult = { stakeUsd: 0, shares: 0, kellyRaw: 0, kellyScaled: 0, cappedBy: "kelly" };

  if (price <= 0 || price >= 1) return zero;
  if (pFair <= 0 || pFair >= 1) return zero;

  const b = (1 - price) / price;
  const q = 1 - pFair;
  const kellyRaw = (b * pFair - q) / b;
  if (kellyRaw <= 0) return zero;

  const kellyScaled = kellyRaw * config.risk.kellyFraction;

  let fraction = kellyScaled;
  let cappedBy: SizingResult["cappedBy"] = "none";
  if (fraction > config.risk.maxPositionPct) {
    fraction = config.risk.maxPositionPct;
    cappedBy = "max_position";
  }

  const stakeUsd = Math.max(0, fraction * bankrollUsd);
  return { stakeUsd, shares: stakeUsd / price, kellyRaw, kellyScaled, cappedBy };
}
