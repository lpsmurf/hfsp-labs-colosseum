import type { Finding } from '../report.js';

/**
 * Response-header hygiene. Maps the shieldfy API-Security-Checklist "Output" section:
 * X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, HSTS, and removal of
 * fingerprinting headers (Server, X-Powered-By, X-AspNet-Version).
 */
const RECOMMENDED = [
  { header: 'x-content-type-options',   why: 'prevents MIME sniffing (nosniff)' },
  { header: 'strict-transport-security', why: 'enforces HTTPS (HSTS)' },
  { header: 'x-frame-options',          why: 'prevents clickjacking' },
  { header: 'content-security-policy',  why: 'restricts resource loading' },
];

const FINGERPRINTING = ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];

export async function probeHeaders(endpoint: string): Promise<Finding[]> {
  let headers: Headers;
  try {
    const res = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(8_000) });
    headers = res.headers;
  } catch {
    return [];
  }

  const findings: Finding[] = [];

  const missing = RECOMMENDED.filter(r => !headers.get(r.header));
  if (missing.length) {
    findings.push({
      id:       'DYN-HDR-001',
      severity: 'INFO',
      title:    'Missing recommended security headers',
      detail:   `The endpoint response omits: ${missing.map(m => `${m.header} (${m.why})`).join('; ')}. Low impact for a pure JSON API, but easy hardening (per the shieldfy API-Security-Checklist "Output" section).`,
      location: endpoint,
      fix:      "Set X-Content-Type-Options: nosniff, X-Frame-Options: deny, Content-Security-Policy: default-src 'none', and Strict-Transport-Security on all responses.",
    });
  }

  // Fingerprinting headers that reveal server/framework details.
  const leaked = FINGERPRINTING.filter(h => headers.get(h));
  const server = headers.get('server');
  if (leaked.length || server) {
    const parts = [...leaked.map(h => `${h}: ${headers.get(h)}`), ...(server ? [`server: ${server}`] : [])];
    findings.push({
      id:       'DYN-HDR-002',
      severity: 'INFO',
      title:    'Fingerprinting headers expose server/framework details',
      detail:   `Response includes fingerprinting header(s): ${parts.join('; ')}. These reveal the stack/host and narrow an attacker's search for known CVEs.`,
      location: endpoint,
      fix:      'Strip Server / X-Powered-By / X-AspNet-Version headers at the edge or in the app.',
    });
  }

  return findings;
}
