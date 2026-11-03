/**
 * Soccer stat-key encoding for the TxODDS scores stat-validation flow.
 *
 * A stat key passed to `GET /api/scores/stat-validation` (and echoed back in the
 * on-chain `ScoreStat.key`) combines a base statistic with a match period via a
 * period multiplier. Full-game uses the base key unchanged; each period adds a
 * fixed offset.
 *
 *   statKey(P1_GOALS, "H1")  === 1001
 *   statKey(P2_GOALS, "H2")  === 2002
 */

/** Base soccer statistic keys (full-game, participant 1 and 2). */
export const BASE_STAT_KEYS = {
  P1_GOALS: 1,
  P2_GOALS: 2,
  P1_YELLOW: 3,
  P2_YELLOW: 4,
  P1_RED: 5,
  P2_RED: 6,
  P1_CORNERS: 7,
  P2_CORNERS: 8,
} as const;

export type BaseStatKey = keyof typeof BASE_STAT_KEYS;

/** Period offset added to a base key. FULL_GAME is the base key unchanged. */
export const PERIOD_MULTIPLIER = {
  FULL_GAME: 0,
  H1: 1000,
  H2: 2000,
  ET1: 3000,
  ET2: 4000,
  PENALTIES: 5000,
} as const;

export type Period = keyof typeof PERIOD_MULTIPLIER;

/**
 * Encode a base stat + period into the wire stat key.
 * `period` defaults to FULL_GAME.
 */
export function statKey(base: number, period: Period = "FULL_GAME"): number {
  return PERIOD_MULTIPLIER[period] + base;
}

/**
 * Decode a wire stat key back into its base statistic and period.
 * Inverse of `statKey`. Returns the numeric base (1–8 range) and the period.
 */
export function decodeStatKey(key: number): { base: number; period: Period } {
  // Period offset is the key rounded down to the nearest 1000, capped at the
  // highest defined period.
  const offset = Math.floor(key / 1000) * 1000;
  const period = (Object.entries(PERIOD_MULTIPLIER).find(
    ([, v]) => v === offset
  )?.[0] ?? "FULL_GAME") as Period;
  return { base: key - PERIOD_MULTIPLIER[period], period };
}

/** Encode a comma-separated list of keys for V2 stat-validation requests. */
export function encodeStatKeys(keys: number[]): string {
  return keys.join(",");
}
