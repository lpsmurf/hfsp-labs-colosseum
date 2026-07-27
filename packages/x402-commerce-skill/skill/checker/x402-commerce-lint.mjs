#!/usr/bin/env node
/**
 * x402-commerce-lint — validates that an x402 seller is DISCOVERABLE, PRICEABLE,
 * and SAFE TO MONETIZE. Zero dependencies, pure, deterministic.
 *
 * Input (auto-detected):
 *   - a URL          → fetched (e.g. https://seller/.well-known/x402)
 *   - a file path    → read
 *   - "-"            → stdin
 * Accepts either a site manifest ({ resources: [{ accepts: [...] }] }) or a single
 * 402 challenge ({ accepts: [...] }).
 *
 * This is a LINTER, not a proof: a clean report means the listing is well-formed
 * and agent-shoppable, not that the seller is honest. Pair with on-chain checks.
 *
 * Exit 0 = GO, 1 = NO-GO (a CRITICAL or HIGH finding), 2 = bad input.
 */

export const SEVERITY = Object.freeze({ CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" });
export const BLOCKING = Object.freeze([SEVERITY.CRITICAL, SEVERITY.HIGH]);

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;          // Bitcoin/Solana base58 alphabet
const INTEGER = /^[0-9]+$/;

function f(severity, code, message, where) {
  return { severity, code, message, where: where ?? "" };
}

/** Pull every `accepts[]` entry out of a manifest or a single challenge, tagged with its route. */
function collectAccepts(doc) {
  const out = [];
  if (Array.isArray(doc?.resources)) {
    for (const r of doc.resources) {
      for (const a of r?.accepts ?? []) out.push({ route: r.url ?? "(resource)", accept: a, parent: r });
    }
  }
  if (Array.isArray(doc?.accepts)) {
    for (const a of doc.accepts) out.push({ route: doc?.resource?.url ?? "(challenge)", accept: a, parent: doc });
  }
  return out;
}

/** Core ruleset — each returns Finding[]. */
export function lint(doc) {
  const findings = [];
  const accepts = collectAccepts(doc);

  // C1 — discoverable: there must be at least one priced "exact" offer.
  if (accepts.length === 0) {
    findings.push(f(SEVERITY.CRITICAL, "C1_NO_OFFERS", "No accepts[] offers found — nothing an agent can buy.", "root"));
    return findings; // nothing else to check
  }
  if (doc?.x402Version === undefined) {
    findings.push(f(SEVERITY.MEDIUM, "C1_NO_VERSION", "Missing x402Version — strict buyers may reject the document.", "root"));
  }

  for (const { route, accept } of accepts) {
    const at = route;

    // C1 — scheme/network present
    if (accept?.scheme !== "exact") {
      findings.push(f(SEVERITY.HIGH, "C1_SCHEME", `scheme must be "exact" (got ${JSON.stringify(accept?.scheme)}).`, at));
    }
    if (!accept?.network || typeof accept.network !== "string") {
      findings.push(f(SEVERITY.HIGH, "C1_NETWORK", "Missing network (e.g. solana:5eykt4...).", at));
    }

    // C2 — priceable: integer atomic amount
    const amt = accept?.amount;
    if (amt === undefined) {
      findings.push(f(SEVERITY.CRITICAL, "C2_NO_AMOUNT", "Missing amount — buyer cannot compute cost.", at));
    } else if (typeof amt !== "string" || !INTEGER.test(amt)) {
      findings.push(f(SEVERITY.CRITICAL, "C2_AMOUNT_NOT_INTEGER",
        `amount must be an integer string of micro-USDC; got ${JSON.stringify(amt)}. A float here is a ~10^6x mispricing.`, at));
    }

    // C2 — asset mint present, base58, not lowercased
    const asset = accept?.asset;
    if (!asset || typeof asset !== "string") {
      findings.push(f(SEVERITY.HIGH, "C2_NO_ASSET", "Missing asset (token mint) — buyer cannot identify the currency.", at));
    } else {
      if (!BASE58.test(asset)) {
        findings.push(f(SEVERITY.HIGH, "C2_ASSET_NOT_BASE58", `asset is not valid base58: ${asset}.`, at));
      } else if (!/[A-Z]/.test(asset)) {
        findings.push(f(SEVERITY.HIGH, "C2_ASSET_LOWERCASED",
          `asset has no uppercase chars — likely a .toLowerCase()'d Solana mint (base58 is case-sensitive = lost funds).`, at));
      }
    }

    // C2 — payTo present + base58
    const payTo = accept?.payTo;
    if (!payTo || typeof payTo !== "string") {
      findings.push(f(SEVERITY.CRITICAL, "C2_NO_PAYTO", "Missing payTo — buyer has no destination.", at));
    } else if (!BASE58.test(payTo)) {
      findings.push(f(SEVERITY.HIGH, "C2_PAYTO_NOT_BASE58", `payTo is not valid base58: ${payTo}.`, at));
    }

    // C3 — resource binding advertised for non-idempotent routes
    const method = (accept?.extra?.method ?? accept?.method ?? "").toString().toUpperCase();
    const idempotent = method === "" || method === "GET" || method === "HEAD";
    const hasMemo = typeof accept?.extra?.memo === "string" && accept.extra.memo.length > 0;
    if (!idempotent && !hasMemo) {
      findings.push(f(SEVERITY.MEDIUM, "C3_NO_BINDING",
        `Non-idempotent route advertises no resource binding (extra.memo) — a paid signature could unlock another route of the same price.`, at));
    }
  }

  return findings;
}

export function verdict(findings) {
  const blocking = findings.filter((x) => BLOCKING.includes(x.severity));
  return { go: blocking.length === 0, blocking: blocking.length, total: findings.length };
}

// ── CLI ────────────────────────────────────────────────────────────────────────
async function readInput(arg) {
  if (!arg || arg === "-") {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8");
  }
  if (/^https?:\/\//.test(arg)) {
    const res = await fetch(arg, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`fetch ${arg} → ${res.status}`);
    return await res.text();
  }
  const { readFileSync } = await import("node:fs");
  return readFileSync(arg, "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const target = args.find((a) => a !== "--json");
  let doc;
  try {
    doc = JSON.parse(await readInput(target));
  } catch (e) {
    console.error(`x402-commerce-lint: cannot read/parse input (${e.message})`);
    process.exit(2);
  }
  const findings = lint(doc);
  const v = verdict(findings);
  if (json) {
    console.log(JSON.stringify({ verdict: v, findings }, null, 2));
  } else {
    for (const x of findings) console.log(`[${x.severity}] ${x.code} @ ${x.where}\n    ${x.message}`);
    console.log(`\n${v.go ? "GO ✓" : "NO-GO ✗"} — ${v.blocking} blocking, ${v.total} total findings`);
  }
  process.exit(v.go ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
