// Deterministic unit suite for the CLMM advisory engine. No network, no funds.
// Run: npm run test:clmm   (sweeps a price x range grid asserting financial invariants)
import { analyzePosition } from "./clmm-engine.js";

let pass = 0, fail = 0;
const fails: string[] = [];
const ok = (cond: boolean, name: string) => { if (cond) pass++; else { fail++; if (fails.length < 25) fails.push(name); } };

const ENTRY = 100;
let lastIlBelow = 0, lastIlAbove = 0;
for (let P = 40; P <= 260; P += 2) {                 // current price sweep
  for (const w of [5, 10, 20, 40, 80]) {             // half-width % of the range
    const Pa = ENTRY * (1 - w / 100), Pb = ENTRY * (1 + w / 100);
    const r = analyzePosition({ entryPrice: ENTRY, currentPrice: P, lowerPrice: Pa, upperPrice: Pb, positionValueUsd: 1000, feeAprPct: 40, horizonDays: 30 });

    ok(r.ilPct <= 0.001, `IL non-positive @P=${P} w=${w} (${r.ilPct})`);          // LP never beats HODL on divergence
    ok((P > Pa && P < Pb) === r.inRange, `range correctness @P=${P} w=${w}`);
    ok(["hold", "rebalance", "exit"].includes(r.rebalanceVerdict), `valid verdict @P=${P} w=${w}`);
    ok(r.projectedFeesUsd >= 0, `fees>=0 @P=${P} w=${w}`);
    ok(r.rebalanceCostUsd > 0, `rebalance cost>0 @P=${P} w=${w}`);
    ok(Number.isFinite(r.ilPct) && Number.isFinite(r.lpValueRel), `finite numbers @P=${P} w=${w}`);
    if (!r.inRange) ok(r.rebalanceVerdict !== "hold", `out-of-range never HOLD @P=${P} w=${w}`);
    if (P === ENTRY) ok(Math.abs(r.ilPct) < 0.01, `~0 IL at entry price w=${w}`);
  }
}

// Monotonicity: IL is ~0 at the entry price (the peak) and its magnitude grows as the price
// diverges further in either direction. Start one step away from entry (100 is the peak).
const il = (P: number) => analyzePosition({ entryPrice: 100, currentPrice: P, lowerPrice: 60, upperPrice: 140, positionValueUsd: 1000, feeAprPct: 40, horizonDays: 30 }).ilPct;
for (let P = 102; P <= 138; P += 2) ok(il(P) <= il(P - 2) + 1e-6, `IL monotone up @${P}`);
for (let P = 98; P >= 62; P -= 2) ok(il(P) <= il(P + 2) + 1e-6, `IL monotone down @${P}`);

console.log(`\n${pass} passed, ${fail} failed  (total ${pass + fail})`);
if (fail) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
