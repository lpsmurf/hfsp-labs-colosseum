// Deterministic unit suite for the bridge skill's pure logic. No network, no funds.
// Run: npm test   (generates thousands of cases across the slippage rails + target registry)
// NOTE: does not load .env — relies on the documented defaults MAX_SLIPPAGE_BPS=300, ABS=1000.
import { checkSwapSlippage, describeSwapSlippage } from "./bridge-safety.js";
import { EVM_TARGETS } from "./evm-targets.js";

const MAX = 300, ABS = 1000;
let pass = 0, fail = 0;
const fails: string[] = [];
const ok = (cond: boolean, name: string) => { if (cond) pass++; else { fail++; if (fails.length < 25) fails.push(name); } };

// 1) Slippage rail: every bps from 0..1200 lands in the right enforcement band (no override).
for (let bps = 0; bps <= 1200; bps++) {
  const f = checkSwapSlippage({ kind: "swap", slippageBps: bps, minAmountOut: 99, amountOut: 100 });
  const cap = f.some((x) => x.includes("exceeds max"));
  const abs = f.some((x) => x.includes("absolute ceiling"));
  const zero = f.some((x) => x.includes("non-zero"));
  if (bps <= 0) ok(zero, `bps ${bps} -> non-zero failure`);
  else if (bps > ABS) ok(abs && !cap, `bps ${bps} -> absolute ceiling`);
  else if (bps > MAX) ok(cap && !abs && !zero, `bps ${bps} -> exceeds max`);
  else ok(!cap && !abs && !zero, `bps ${bps} -> within default cap`);
}

// 2) Explicit consent raises the cap up to the hard rail.
for (let bps = MAX + 1; bps <= ABS; bps++) {
  const f = checkSwapSlippage({ kind: "swap", slippageBps: bps, minAmountOut: 99, amountOut: 100 }, { acceptSlippageBps: bps });
  ok(!f.some((x) => x.includes("exceeds max")), `consent ${bps} -> allowed`);
}

// 3) Consent can NEVER exceed the absolute ceiling.
for (let bps = ABS + 1; bps <= ABS + 200; bps++) {
  const f = checkSwapSlippage({ kind: "swap", slippageBps: bps, minAmountOut: 99, amountOut: 100 }, { acceptSlippageBps: bps });
  ok(f.some((x) => x.includes("absolute ceiling")), `consent ${bps} -> still capped`);
}

// 4) Same-asset bridges skip slippage logic entirely, at every bps.
for (let bps = 0; bps <= 1200; bps++) {
  ok(checkSwapSlippage({ kind: "bridge", slippageBps: bps, minAmountOut: 0, amountOut: 100 }).length === 0, `bridge skips slippage @ ${bps}`);
}

// 5) Floor invariants.
ok(checkSwapSlippage({ kind: "swap", slippageBps: 50, minAmountOut: 0, amountOut: 100 }).some((x) => x.includes("positive minAmountOut")), "zero minOut rejected");
ok(checkSwapSlippage({ kind: "swap", slippageBps: 50, minAmountOut: 101, amountOut: 100 }).some((x) => x.includes("inverted floor")), "inverted floor rejected");
ok(checkSwapSlippage({ kind: "swap", slippageBps: 50, minAmountOut: 99, amountOut: 100 }).length === 0, "valid swap clean");

// 6) describeSwapSlippage formatting.
for (let bps = 0; bps <= 1000; bps += 5) {
  const d = describeSwapSlippage({ kind: "swap", slippageBps: bps, minAmountOut: 1 });
  ok(d.tolerancePct === (bps / 100).toFixed(2) + "%", `describe ${bps} pct`);
  ok(d.aboveDefaultCap === bps > MAX || d.aboveDefaultCap === (bps > MAX), `describe ${bps} aboveCap`);
}
ok(describeSwapSlippage({ kind: "bridge", slippageBps: 0, minAmountOut: 1 }).isSwap === false, "describe bridge not swap");

// 7) EVM target registry integrity.
const addr = /^0x[0-9a-fA-F]{40}$/;
for (const [chain, t] of Object.entries(EVM_TARGETS)) {
  ok((t as any).chainId > 0, `${chain} chainId > 0`);
  ok((t as any).finalitySeconds > 0, `${chain} finalitySeconds > 0`);
  for (const [sym, a] of Object.entries((t as any).tokens)) ok(addr.test(a as string), `${chain}.${sym} valid address`);
}

console.log(`\n${pass} passed, ${fail} failed  (total ${pass + fail})`);
if (fail) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
