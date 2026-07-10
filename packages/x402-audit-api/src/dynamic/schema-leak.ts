import type { Finding } from '../report.js';

/**
 * Detects DB/query/schema leakage and unhandled server errors triggered by crafted input.
 *
 * Generalizes findings from the MultiHopper agentic-flow audit:
 *  - numeric-overflow (amountRaw = 2^63) → 500 leaking the `orchestrator_steps` INSERT + columns
 *  - an intermittent auth-lookup 500 leaking the `api_keys`/`integrations` schema (key_hash, …)
 * Both are the same class: a malformed value reaches the DB layer and the raw driver error
 * (query text + table/column names) is returned to the caller.
 */

// Markers that indicate a raw SQL query / ORM error / DB schema leaked into a response body.
const SCHEMA_LEAK_MARKERS = [
  'failed query', 'select "', 'insert into', 'update "', 'delete from', 'from "',
  'relation "', 'column "', 'syntax error at or near', 'numeric field overflow',
  'invalid input syntax', 'sqlstate', 'pg_', 'sequelize', 'prisma', 'knex', 'typeorm',
  'duplicate key value', 'violates', 'constraint',
];

// Field names commonly backed by integer/numeric DB columns; 2^63 overflows int64.
const OVERFLOW_BODY = {
  amount: '9223372036854775808', amountRaw: '9223372036854775808',
  value: '9223372036854775808', quantity: '9223372036854775808',
  price: '9223372036854775808', limit: 9223372036854775808,
};

async function post(url: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    return { status: res.status, text: (await res.text()).slice(0, 4_000) };
  } catch {
    return null;
  }
}

function leakMarkers(text: string): string[] {
  const lower = text.toLowerCase();
  return SCHEMA_LEAK_MARKERS.filter(m => lower.includes(m));
}

export async function probeSchemaLeak(endpoint: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const cases: Array<{ label: string; body: unknown }> = [
    { label: 'numeric overflow (2^63)', body: OVERFLOW_BODY },
    { label: 'type confusion (arrays/objects where scalars expected)', body: { amount: [1], id: { x: 1 }, name: [null] } },
    { label: 'prototype pollution', body: { __proto__: { polluted: true }, amount: '1' } },
    { label: 'malformed JSON', body: '}{ not json' },
  ];

  let sawServerError = false;
  for (const c of cases) {
    const res = await post(endpoint, c.body);
    if (!res) continue;
    const markers = leakMarkers(res.text);
    if (markers.length) {
      findings.push({
        id:       'DYN-LEAK-001',
        severity: 'HIGH',
        title:    'Database query / schema leaked in error response',
        detail:   `A "${c.label}" request returned HTTP ${res.status} whose body leaked DB internals (markers: ${markers.join(', ')}). The raw driver/ORM error — including query text and table/column names — is returned to any caller, exposing the internal schema. Body: ${res.text.slice(0, 220)}`,
        location: endpoint,
        fix:      'Validate numeric inputs as bounded BigInts before any DB write; wrap all handlers in an error boundary that maps unhandled DB errors to a generic code with no query/schema text. Add a regression test asserting no SQL/table names appear in any error body.',
      });
      break; // one confirmed leak is enough
    }
    if (res.status >= 500) sawServerError = true;
  }

  if (!findings.length && sawServerError) {
    findings.push({
      id:       'DYN-LEAK-002',
      severity: 'MEDIUM',
      title:    'Unhandled server error (500) on malformed input',
      detail:   'A crafted request (numeric overflow / type confusion / malformed JSON) triggered an HTTP 500. Unhandled errors on bad input are a reliability problem and a common precursor to information disclosure.',
      location: endpoint,
      fix:      'Validate/normalize all input at the request boundary and return a 4xx for bad input; never let unhandled exceptions reach the client as a 500.',
    });
  }

  return findings;
}
