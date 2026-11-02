import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';

// Upstream response passthrough.
//
// A paid API often buys something from a supplier (gift cards, top-ups, eSIMs,
// API credits) and then returns what the supplier sent. Supplier payloads carry
// the goods themselves — voucher codes, PINs, card numbers — plus the buyer's
// contact details and the supplier's own order id, which frequently works as a
// bearer token upstream. Returning that object wholesale from a lookup route
// (`GET /orders/:id`) hands all of it to anyone who learns the id, and ids leak:
// they sit in logs, URLs, emails and — for on-chain checkouts — public calldata.
//
// Found in the wild (our own store, 2026-09-13): a status endpoint returned the
// supplier order including voucher_code and pin_serial, keyed by an order code
// that was embedded in the buyer's on-chain transaction.
//
// The rules only fire on the unfiltered shape: `res.json(upstream)`,
// `{ data: upstream }`, `{ ...upstream }`, or `{ result: record.result }`.
// Wrapping the value in any function call (`pick(x)`, `redact(x)`) silences them,
// which is exactly the fix.

const ROUTE = /\b(?:app|router|server|api|r)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]*)\2/g;

// Right-hand sides that produce data from outside this service.
const UPSTREAM_CALL = /\bfetch\s*\(|\baxios\b|\bgot\s*\(|\.json\s*\(\s*\)|\bundici\b|\brequest\s*\(|\b(?:get|fetch|lookup|retrieve|poll)[A-Z]\w*\s*\(/;

// Properties that conventionally hold a stored upstream payload.
const STORED_PAYLOAD = String.raw`(\w+)\s*\??\.\s*(result|raw|response|upstream|payload|providerResponse|supplierResponse|supplierOrder|upstreamResponse)\b`;

// Field names whose presence in the codebase means a passthrough is likely to
// carry goods or credentials, not just metadata.
const SENSITIVE = /\b(?:voucher(?:_?code)?|pin_serial|pin_?code|redeem(?:_?code|_?url)|gift_?code|card_?number|cvv|private_?key|secret_?key|api_?key|mnemonic|seed_?phrase|password|access_?token|refresh_?token)\b/i;

interface Handler { method: string; path: string; body: string; offset: number }

/** Route handler source spans, found by balancing parentheses from each registration. */
function handlers(content: string): Handler[] {
  const out: Handler[] = [];
  ROUTE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = ROUTE.exec(content)); ) {
    const open = content.indexOf('(', m.index);
    let depth = 0, i = open, quote = '';
    for (; i < content.length; i++) {
      const c = content[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    out.push({ method: m[1].toUpperCase(), path: m[3], body: content.slice(open, i + 1), offset: m.index });
  }
  return out;
}

const lineOf = (content: string, offset: number) => content.slice(0, offset).split('\n').length;

// Upstream calls that fetch a private record rather than public reference data.
// A catalog or price feed passed through is harmless; an order, payment or
// account is not.
const PRIVATE_RECORD = /\w*(?:order|payment|account|user|wallet|session|token|voucher|receipt|invoice|transaction|customer|profile|delivery|purchase|redemption|subscription)\w*\s*\(/i;

/** Identifiers assigned from an upstream call in a span, mapped to whether each looks like a private record. */
function upstreamIdentifiers(span: string): Map<string, boolean> {
  const ids = new Map<string, boolean>();
  const assign = /\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*([^;\n]+)/g;
  for (let m: RegExpExecArray | null; (m = assign.exec(span)); ) {
    if (UPSTREAM_CALL.test(m[2])) ids.set(m[1], PRIVATE_RECORD.test(m[2]));
  }
  return ids;
}

/** Arguments of res.json(...) / res.send(...) calls, allowing a .status(n) chain. */
function sinkArguments(span: string): Array<{ arg: string; index: number }> {
  const out: Array<{ arg: string; index: number }> = [];
  const sink = /\b(?:res|reply|ctx\.body\s*=|response)\s*(?:\.\s*status\s*\([^)]*\)\s*)?\.\s*(?:json|send)\s*\(/g;
  for (let m: RegExpExecArray | null; (m = sink.exec(span)); ) {
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    for (; i < span.length && depth; i++) {
      if (span[i] === '(' || span[i] === '{' || span[i] === '[') depth++;
      else if (span[i] === ')' || span[i] === '}' || span[i] === ']') depth--;
    }
    out.push({ arg: span.slice(start, i - 1), index: m.index });
  }
  return out;
}

/** Is `id` returned unfiltered in this argument: bare, as a property value, or spread? */
function returnsUnfiltered(arg: string, id: string): boolean {
  const e = id.replace(/[$]/g, '\\$');
  return new RegExp(String.raw`^\s*(?:await\s+)?${e}\s*$`).test(arg)
    || new RegExp(String.raw`[{,]\s*\w+\s*:\s*${e}\s*(?:[,}]|$)`).test(arg)
    || new RegExp(String.raw`[{,]\s*${e}\s*(?:[,}]|$)`).test(arg)   // shorthand { ok, data }
    || new RegExp(String.raw`\.\.\.\s*${e}\b`).test(arg);
}

export function checkExposure(file: RepoFile): Finding[] {
  const { path, content } = file;
  if (/\.(test|spec)\.|node_modules|__tests__|\/fixtures?\//.test(path)) return [];
  const routes = handlers(content);
  if (!routes.length) return [];

  const findings: Finding[] = [];
  const sensitiveNearby = SENSITIVE.test(content);
  const seen = new Set<string>();

  const severityFor = (lookup: boolean) =>
    (lookup || sensitiveNearby ? 'HIGH' : 'MEDIUM') as Finding['severity'];

  // EXPOSE-001: a handler returns what it just fetched from upstream.
  for (const h of routes) {
    const lookup = /:\w+|\{\w+\}|\[\w+\]/.test(h.path);
    for (const [id, privateRecord] of upstreamIdentifiers(h.body)) {
      // Public reference data (catalogs, prices) passed through is not an exposure.
      if (!lookup && !privateRecord && !sensitiveNearby) continue;
      for (const { arg } of sinkArguments(h.body)) {
        if (!returnsUnfiltered(arg, id)) continue;
        const key = `001:${h.offset}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          id:         'STATIC-EXPOSE-001',
          severity:   severityFor(lookup),
          confidence: lookup ? 'HIGH' : 'MEDIUM',
          title:      `${h.method} ${h.path} returns an upstream response unfiltered`,
          detail:
            `\`${id}\` comes from an upstream call and is sent to the client as-is. Supplier and provider ` +
            `payloads routinely include the purchased goods (voucher codes, PINs, card numbers), the buyer's ` +
            `contact details, and the provider's own ids — which often fetch the same data upstream.` +
            (lookup ? ' This route looks records up by an id in the path, so anyone who learns an id gets the payload.' : '') +
            (sensitiveNearby ? ' This file handles fields such as voucher codes, PINs or keys.' : ''),
          location:   `${path}:${lineOf(content, h.offset)}`,
          fix:
            'Return an explicit allowlist of fields (status, delivery state, display names) instead of the upstream ' +
            'object. Deliver goods through the channel the buyer controls (email, the paid response itself), and ' +
            'never expose the provider\'s order id.',
          refs: ['CWE-200', 'CWE-359', 'OWASP API3:2023 Broken Object Property Level Authorization'],
        });
      }
    }
  }

  // EXPOSE-002: a stored upstream payload (`record.result`) is echoed from a
  // file that serves lookup routes. Checked across the file, because the
  // response object is often built in a helper (`publicView(order)`).
  const hasLookupRoute = routes.some(h => /:\w+|\{\w+\}|\[\w+\]/.test(h.path));
  if (hasLookupRoute) {
    const property = new RegExp(String.raw`[{,]\s*(\w+)\s*:\s*${STORED_PAYLOAD}\s*(?=[,}\n])`, 'g');
    for (let m: RegExpExecArray | null; (m = property.exec(content)); ) {
      const key = `002:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        id:         'STATIC-EXPOSE-002',
        severity:   'HIGH',
        confidence: 'MEDIUM',
        title:      `Stored upstream payload \`${m[2]}.${m[3]}\` returned from a lookup API`,
        detail:
          `\`${m[1]}: ${m[2]}.${m[3]}\` places a stored provider payload into a response object in a file that ` +
          `serves id-based lookups. Whoever holds the id — from a log, a URL, an email, or on-chain calldata — ` +
          `receives everything the provider returned.` +
          (sensitiveNearby ? ' This file handles fields such as voucher codes, PINs or keys.' : ''),
        location:   `${path}:${lineOf(content, m.index)}`,
        fix:
          `Map \`${m[2]}.${m[3]}\` through an allowlist (for example \`${m[1]}: publicFields(${m[2]}.${m[3]})\`) ` +
          'that keeps only status and display fields.',
        refs: ['CWE-200', 'OWASP API3:2023 Broken Object Property Level Authorization'],
      });
    }
  }

  return findings;
}
