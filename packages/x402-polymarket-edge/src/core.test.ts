import { describe, it, expect } from "vitest";
import { decimalToImplied, devigProportional, devigTwoWay, clvPct } from "./fairvalue/devig.js";
import { sizePosition } from "./sizing/kelly.js";

describe("devig", () => {
  it("converts decimal odds to implied probability", () => {
    expect(decimalToImplied(2.0)).toBeCloseTo(0.5, 6);
    expect(decimalToImplied(4.0)).toBeCloseTo(0.25, 6);
  });

  it("rejects invalid odds", () => {
    expect(() => decimalToImplied(1.0)).toThrow();
    expect(() => decimalToImplied(0.5)).toThrow();
  });

  it("removes the vig so fair probs sum to 1", () => {
    // Pinnacle-ish 2-way with ~2.7% overround.
    const fair = devigProportional([1.90, 1.95]);
    expect(fair[0]! + fair[1]!).toBeCloseTo(1, 9);
    expect(fair[0]!).toBeGreaterThan(fair[1]!); // shorter odds => higher prob
  });

  it("devigTwoWay returns the first outcome's fair prob", () => {
    const p = devigTwoWay(1.90, 1.95);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.53);
  });

  it("CLV is positive when the line closes above entry", () => {
    expect(clvPct(0.50, 0.55)).toBeCloseTo(10, 6);   // bought at 0.50, closed 0.55
    expect(clvPct(0.55, 0.50)).toBeLessThan(0);       // bought worse than close
    expect(clvPct(0.50, 0)).toBe(0);                  // guard
  });
});

describe("kelly", () => {
  it("returns no bet when there is no edge", () => {
    // Fair == price => zero edge => no stake.
    const r = sizePosition(0.5, 0.5, 1000);
    expect(r.stakeUsd).toBe(0);
  });

  it("returns no bet for degenerate prices/probs", () => {
    expect(sizePosition(0.6, 0, 1000).stakeUsd).toBe(0);
    expect(sizePosition(0.6, 1, 1000).stakeUsd).toBe(0);
    expect(sizePosition(0, 0.5, 1000).stakeUsd).toBe(0);
    expect(sizePosition(1, 0.5, 1000).stakeUsd).toBe(0);
  });

  it("sizes a positive edge and caps at max position", () => {
    // Strong edge: fair 0.70 at price 0.50. Raw Kelly is large => capped at 5%.
    const r = sizePosition(0.70, 0.50, 1000);
    expect(r.stakeUsd).toBeGreaterThan(0);
    expect(r.stakeUsd).toBeLessThanOrEqual(0.05 * 1000 + 1e-9); // MAX_POSITION_PCT default 5%
    expect(r.kellyRaw).toBeGreaterThan(0);
  });

  it("scales smaller edges below the cap by quarter-Kelly", () => {
    // Mild edge: fair 0.53 at 0.50. Quarter-Kelly should be well under the 5% cap.
    const r = sizePosition(0.53, 0.50, 1000);
    expect(r.stakeUsd).toBeGreaterThan(0);
    expect(r.cappedBy).not.toBe("max_position");
  });
});
