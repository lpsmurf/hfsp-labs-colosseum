import { test } from "node:test";
import assert from "node:assert/strict";
import { lint, verdict } from "./x402-commerce-lint.mjs";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAYTO = "GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY";

const goodAccept = (over = {}) => ({
  scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  amount: "5000", asset: USDC, payTo: PAYTO, extra: { method: "POST", memo: "/score" }, ...over,
});
const challenge = (accept) => ({ x402Version: 2, resource: { url: "https://s/score" }, accepts: [accept] });

test("clean POST challenge with binding → GO", () => {
  const fr = lint(challenge(goodAccept()));
  assert.equal(verdict(fr).go, true, JSON.stringify(fr));
});

test("C1: no offers → NO-GO", () => {
  const fr = lint({ x402Version: 2 });
  assert.ok(fr.some((x) => x.code === "C1_NO_OFFERS"));
  assert.equal(verdict(fr).go, false);
});

test("C2: float amount → CRITICAL NO-GO", () => {
  const fr = lint(challenge(goodAccept({ amount: "0.005" })));
  assert.ok(fr.some((x) => x.code === "C2_AMOUNT_NOT_INTEGER" && x.severity === "CRITICAL"));
  assert.equal(verdict(fr).go, false);
});

test("C2: lowercased mint → HIGH NO-GO", () => {
  const fr = lint(challenge(goodAccept({ asset: USDC.toLowerCase() })));
  assert.ok(fr.some((x) => x.code === "C2_ASSET_LOWERCASED"));
  assert.equal(verdict(fr).go, false);
});

test("C2: missing payTo → CRITICAL NO-GO", () => {
  const a = goodAccept(); delete a.payTo;
  const fr = lint(challenge(a));
  assert.ok(fr.some((x) => x.code === "C2_NO_PAYTO"));
  assert.equal(verdict(fr).go, false);
});

test("C3: non-idempotent route without binding → MEDIUM warning, still GO", () => {
  const a = goodAccept(); delete a.extra.memo;
  const fr = lint(challenge(a));
  assert.ok(fr.some((x) => x.code === "C3_NO_BINDING" && x.severity === "MEDIUM"));
  assert.equal(verdict(fr).go, true); // medium is non-blocking
});

test("manifest with multiple resources is validated per-route", () => {
  const manifest = {
    x402Version: 2,
    resources: [
      { url: "https://s/a", accepts: [goodAccept()] },
      { url: "https://s/b", accepts: [goodAccept({ amount: "0.5" })] }, // float → flagged
    ],
  };
  const fr = lint(manifest);
  assert.ok(fr.some((x) => x.code === "C2_AMOUNT_NOT_INTEGER" && x.where === "https://s/b"));
  assert.equal(verdict(fr).go, false);
});
