import type { Finding } from '../report.js';

/** Recommended response security headers (low severity for a JSON API, but cheap hardening). */
const RECOMMENDED = [
  { header: 'x-content-type-options', why: 'prevents MIME sniffing' },
  { header: 'strict-transport-security', why: 'enforces HTTPS' },
];

export async function probeHeaders(endpoint: string): Promise<Finding[]> {
  let headers: Headers;
  try {
    const res = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(8_000) });
    headers = res.headers;
  } catch {
    return [];
  }

  const missing = RECOMMENDED.filter(r => !headers.get(r.header));
  if (!missing.length) return [];

  return [{
    id:       'DYN-HDR-001',
    severity: 'INFO',
    title:    'Missing recommended security headers',
    detail:   `The endpoint response omits: ${missing.map(m => `${m.header} (${m.why})`).join('; ')}. Low impact for a pure JSON API, but easy hardening.`,
    location: endpoint,
    fix:      'Set X-Content-Type-Options: nosniff and Strict-Transport-Security on all responses (and a restrictive Content-Security-Policy if any HTML is served).',
  }];
}
