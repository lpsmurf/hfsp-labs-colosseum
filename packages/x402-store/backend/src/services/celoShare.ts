// Revenue-share math, kept free of I/O (no redis, no config) so it is unit-
// testable on its own and cannot drag environment validation into a test.
export const SHARE_BPS = BigInt(Math.round(Number(process.env.INTEGRATOR_SHARE_BPS ?? "3000")));

/** The integrator's cut of a commission, rounded down (we never over-credit). */
export function revenueShare(commissionAtomic: bigint, shareBps = SHARE_BPS): bigint {
  if (commissionAtomic <= 0n) return 0n;
  return (commissionAtomic * shareBps) / 10_000n;
}
