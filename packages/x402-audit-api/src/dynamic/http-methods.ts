import type { Finding } from '../report.js';

/**
 * HTTP method + content-type handling. Maps the shieldfy API-Security-Checklist "Input" section:
 * an API should answer unsupported methods with 405 (not 500/200) and reject a wrong request
 * content-type with 415/406 (not 500). Generalizes the MultiHopper verb-tampering + content-type
 * probes (there: PUT/PATCH/DELETE → 404, wrong content-type → 415).
 */
async function send(url: string, method: string, headers: Record<string, string> = {}, body?: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(8_000) });
    return res.status;
  } catch {
    return null;
  }
}

export async function probeHttpMethods(endpoint: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Unsupported methods should be 405 (or 404) — never 200 (unintended action) or 500 (unhandled).
  for (const method of ['PUT', 'PATCH', 'DELETE', 'TRACE']) {
    const status = await send(endpoint, method);
    if (status === 200) {
      findings.push({
        id:       'DYN-METHOD-001',
        severity: 'MEDIUM',
        title:    `Unsupported HTTP method ${method} returned 200`,
        detail:   `${method} on ${endpoint} returned HTTP 200 — an unexpected method should not succeed. This can indicate an unintended mutation/verb-confusion path.`,
        location: endpoint,
        fix:      'Respond with 405 Method Not Allowed for methods a resource does not support; only implement the verbs you intend.',
      });
      break;
    }
    if (status && status >= 500) {
      findings.push({
        id:       'DYN-METHOD-002',
        severity: 'LOW',
        title:    `Unsupported HTTP method ${method} triggered a 500`,
        detail:   `${method} on ${endpoint} returned HTTP ${status}. An unsupported method should return 405, not an unhandled server error.`,
        location: endpoint,
        fix:      'Handle unsupported methods with a 405 response instead of letting them reach an unhandled error path.',
      });
      break;
    }
  }

  // Wrong request content-type should be 415/406/400 — not 500.
  const ctStatus = await send(endpoint, 'POST', { 'Content-Type': 'text/plain' }, 'not json at all');
  if (ctStatus && ctStatus >= 500) {
    findings.push({
      id:       'DYN-METHOD-003',
      severity: 'LOW',
      title:    'Wrong request content-type triggered a 500',
      detail:   `A POST with Content-Type: text/plain returned HTTP ${ctStatus}. Unsupported content-types should return 415 Unsupported Media Type, not an unhandled 500.`,
      location: endpoint,
      fix:      'Validate the request Content-Type and return 415 for unsupported types.',
    });
  }

  return findings;
}
