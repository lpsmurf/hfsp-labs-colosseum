// Self-contained CLMM advisory math (no heavy deps): impermanent loss vs HODL using the
// concentrated-liquidity value function, out-of-range detection, and an expected-value
// rebalance verdict (projected fees vs IL realized + gas + slippage). Read-only / advisory.
// Prices are token1-per-token0 (e.g. USDC per SOL).

export interface PositionInput {
  entryPrice: number;     // price when the position was opened
  currentPrice: number;   // current price
  lowerPrice: number;     // range lower bound (Pa)
  upperPrice: number;     // range upper bound (Pb)
  positionValueUsd: number; // current notional value of the position (for fee/gas scaling)
  feeAprPct: number;      // estimated fee APR while in range (e.g. 40 = 40%)
  horizonDays: number;    // horizon to project fees over
  gasCostUsd?: number;    // cost to rebalance (tx fees), default 0.5
  slippageBps?: number;   // slippage cost of rebalancing, default 30
}

export interface PositionReport {
  inRange: boolean;
  edgeProximityPct: number;  // how close current price is to the nearest range edge (0 = at edge)
  ilPct: number;             // impermanent loss vs HODL, % (negative = loss)
  lpValueRel: number;        // LP value relative to entry (1 = unchanged)
  hodlValueRel: number;      // HODL value relative to entry
  projectedFeesUsd: number;  // fees expected over the horizon IF in range
  rebalanceCostUsd: number;  // gas + slippage to rebalance
  rebalanceVerdict: "hold" | "rebalance" | "exit";
  reason: string;
}

// Uniswap-v3-style CL token amounts for liquidity L over [Pa,Pb] at price P (sqrt-price form).
function amounts(L: number, P: number, Pa: number, Pb: number): { x: number; y: number } {
  const s = Math.sqrt(P), sa = Math.sqrt(Pa), sb = Math.sqrt(Pb);
  if (P <= Pa) return { x: L * (1 / sa - 1 / sb), y: 0 };       // all token0
  if (P >= Pb) return { x: 0, y: L * (sb - sa) };               // all token1
  return { x: L * (1 / s - 1 / sb), y: L * (s - sa) };          // both
}
const valueInToken1 = (x: number, y: number, P: number) => x * P + y;

export function analyzePosition(p: PositionInput): PositionReport {
  const { entryPrice: P0, currentPrice: P, lowerPrice: Pa, upperPrice: Pb } = p;
  const gas = p.gasCostUsd ?? 0.5;
  const slip = (p.slippageBps ?? 30) / 10000;

  // Normalize liquidity L=1; compare LP value to HODL of the entry composition.
  const L = 1;
  const entry = amounts(L, Math.min(Math.max(P0, Pa), Pb), Pa, Pb); // entry amounts (clamp into range)
  const entryVal = valueInToken1(entry.x, entry.y, P0) || 1;
  const now = amounts(L, P, Pa, Pb);
  const lpVal = valueInToken1(now.x, now.y, P);
  const hodlVal = valueInToken1(entry.x, entry.y, P); // held the entry tokens through price move
  const ilPct = (lpVal / hodlVal - 1) * 100;

  const inRange = P > Pa && P < Pb;
  const span = Pb - Pa;
  const edgeProximityPct = inRange ? (Math.min(P - Pa, Pb - P) / (span / 2)) * 100 : 0;

  const projectedFeesUsd = inRange
    ? p.positionValueUsd * (p.feeAprPct / 100) * (p.horizonDays / 365)
    : 0;
  const rebalanceCostUsd = gas + p.positionValueUsd * slip;

  let rebalanceVerdict: PositionReport["rebalanceVerdict"];
  let reason: string;
  if (!inRange) {
    // Out of range = earning zero fees. Rebalance if re-centering's projected fees beat the cost.
    const projectedIfRecentered = p.positionValueUsd * (p.feeAprPct / 100) * (p.horizonDays / 365);
    if (projectedIfRecentered > rebalanceCostUsd) {
      rebalanceVerdict = "rebalance";
      reason = `out of range (earning 0 fees); re-centering projects $${projectedIfRecentered.toFixed(2)} fees > $${rebalanceCostUsd.toFixed(2)} cost`;
    } else {
      rebalanceVerdict = "exit";
      reason = `out of range; projected fees $${projectedIfRecentered.toFixed(2)} don't beat rebalance cost $${rebalanceCostUsd.toFixed(2)} — exit`;
    }
  } else if (edgeProximityPct < 15) {
    rebalanceVerdict = projectedFeesUsd > rebalanceCostUsd ? "rebalance" : "hold";
    reason = `near range edge (${edgeProximityPct.toFixed(0)}% from center); ${rebalanceVerdict === "rebalance" ? "widen/re-center now" : "fees don't justify cost yet"}`;
  } else {
    rebalanceVerdict = "hold";
    reason = `healthy & in range; projected fees $${projectedFeesUsd.toFixed(2)} over ${p.horizonDays}d`;
  }

  return {
    inRange,
    edgeProximityPct: Number(edgeProximityPct.toFixed(1)),
    ilPct: Number(ilPct.toFixed(3)),
    lpValueRel: Number((lpVal / entryVal).toFixed(4)),
    hodlValueRel: Number((hodlVal / entryVal).toFixed(4)),
    projectedFeesUsd: Number(projectedFeesUsd.toFixed(2)),
    rebalanceCostUsd: Number(rebalanceCostUsd.toFixed(2)),
    rebalanceVerdict,
    reason,
  };
}
