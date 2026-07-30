import { test } from "node:test";
import assert from "node:assert/strict";

import { NETWORKS, USDC, isMainnet, usdc, usdcToDollars } from "./networks.js";
import { FACILITATORS, createResourceServer, gate, multiGate } from "./server.js";
import { buildChallenge, decode, encode, readProof, HEADER } from "./legacy.js";

test("usdc converts dollars to 6-decimal atomic units", () => {
  assert.equal(usdc(0.99), "990000");
  assert.equal(usdc(1), "1000000");
  assert.equal(usdc(0.0001), "100");
  // Float noise must not leak into an on-chain amount.
  assert.equal(usdc(0.07 * 3), "210000");
});

test("usdc rejects nonsense amounts", () => {
  assert.throws(() => usdc(-1));
  assert.throws(() => usdc(NaN));
});

test("usdcToDollars round-trips", () => {
  assert.equal(usdcToDollars(usdc(2.5)), 2.5);
});

test("networks are CAIP-2 shaped", () => {
  for (const [name, id] of Object.entries(NETWORKS)) {
    assert.match(id, /^[a-z0-9]+:.+$/, `${name} is not CAIP-2`);
    assert.ok(!id.includes("-mainnet"), `${name} looks like a V1 network name`);
  }
});

test("every network has a USDC asset", () => {
  for (const name of Object.keys(NETWORKS)) {
    assert.ok(USDC[name as keyof typeof USDC], `no USDC for ${name}`);
  }
});

test("isMainnet flags only real-money networks", () => {
  assert.equal(isMainnet("base"), true);
  assert.equal(isMainnet("solana"), true);
  assert.equal(isMainnet("baseSepolia"), false);
  assert.equal(isMainnet("solanaDevnet"), false);
});

// The check that matters: x402.org is a testnet facilitator, and pointing mainnet
// routes at it produces payments that look fine and never settle.
test("createResourceServer refuses x402.org on mainnet", () => {
  assert.throws(
    () => createResourceServer({
      facilitatorUrl: FACILITATORS.x402org,
      families: ["evm"],
      networks: ["base"],
    }),
    /testnet\/quickstart service/,
  );
});

test("createResourceServer allows x402.org on testnet", () => {
  assert.doesNotThrow(() => createResourceServer({
    facilitatorUrl: FACILITATORS.x402org,
    families: ["evm"],
    networks: ["baseSepolia"],
  }));
});

test("createResourceServer allows a production facilitator on mainnet", () => {
  assert.doesNotThrow(() => createResourceServer({
    facilitatorUrl: FACILITATORS.payai,
    families: ["evm", "svm"],
    networks: ["base", "solana"],
  }));
});

test("gate emits an explicit asset+amount, never a price string", () => {
  const route = gate({
    price: 0.99,
    payTo: "0xabc",
    network: "base",
    description: "Security audit",
  });
  const accepts = Array.isArray(route.accepts) ? route.accepts : [route.accepts];
  assert.equal(accepts.length, 1);
  assert.equal(accepts[0].scheme, "exact");
  assert.equal(accepts[0].network, NETWORKS.base);
  assert.deepEqual(accepts[0].price, { asset: USDC.base, amount: "990000" });
});

test("multiGate accepts one price per network", () => {
  const route = multiGate("Cross-chain resource", [
    { price: 0.99, payTo: "0xabc", network: "base", description: "" },
    { price: 0.99, payTo: "So1ana", network: "solana", description: "" },
  ]);
  const accepts = Array.isArray(route.accepts) ? route.accepts : [route.accepts];
  assert.equal(accepts.length, 2);
  assert.deepEqual(accepts.map(a => a.network), [NETWORKS.base, NETWORKS.solana]);
});

test("multiGate rejects an empty option list", () => {
  assert.throws(() => multiGate("nothing", []));
});

test("buildChallenge is V2 shaped", () => {
  const c = buildChallenge({
    resourceUrl: "https://example.com/audit",
    description: "Audit",
    price: 0.99,
    payTo: "0xabc",
    network: "base",
  });
  assert.equal(c.x402Version, 2);
  assert.equal(c.accepts[0].network, NETWORKS.base);
  assert.equal(c.accepts[0].amount, "990000");
  assert.equal(c.accepts[0].asset, USDC.base);
});

test("encode/decode round-trip", () => {
  const c = buildChallenge({
    resourceUrl: "https://example.com/x",
    description: "d",
    price: 1,
    payTo: "0xabc",
    network: "base",
  });
  assert.deepEqual(decode(encode(c)), c);
});

test("decode returns null on garbage rather than throwing", () => {
  assert.equal(decode("not-base64-json"), null);
});

test("readProof prefers the V2 header over a legacy one", () => {
  const found = readProof(
    { [HEADER.signature.toLowerCase()]: "v2proof", "x-payment": "v1proof" },
    "X-Payment",
  );
  assert.deepEqual(found, { value: "v2proof", header: HEADER.signature });
});

test("readProof falls back to the legacy header", () => {
  const found = readProof({ "x-payment": "v1proof" }, "X-Payment");
  assert.deepEqual(found, { value: "v1proof", header: "X-Payment" });
});

test("readProof ignores whitespace-only values", () => {
  assert.equal(readProof({ "x-payment": "   " }, "X-Payment"), null);
});
