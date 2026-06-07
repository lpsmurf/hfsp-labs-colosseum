import type { Finding } from '../report.js';

const EVIL_ORIGIN = 'https://evil.example';

async function corsRequest(url: string, method = 'POST'): Promise<Headers | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Origin': EVIL_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify({}) : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    return res.headers;
  } catch {
    return null;
  }
}

export async function probeCors(endpoint: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const headers = await corsRequest(endpoint);
  if (!headers) return findings;

  const acao  = headers.get('access-control-allow-origin') ?? '';
  const acac  = headers.get('access-control-allow-credentials') ?? '';
  const isCredentials = acac.toLowerCase() === 'true';

  if (acao === EVIL_ORIGIN && isCredentials) {
    findings.push({
      id:       'DYN-CORS-001',
      severity: 'HIGH',
      title:    'CORS reflects attacker Origin with credentials:true — confirmed exploitable',
      detail:   `The endpoint returned Access-Control-Allow-Origin: ${EVIL_ORIGIN} and Access-Control-Allow-Credentials: true in response to a request with Origin: ${EVIL_ORIGIN}. A malicious web page can make credentialed cross-origin requests to this API and read the full response.`,
      location: endpoint,
      fix:      'Remove `credentials: true` (not needed for x402 APIs) or pin an explicit origin allowlist. Never reflect the request Origin verbatim.',
    });
  } else if (acao === '*' && isCredentials) {
    findings.push({
      id:       'DYN-CORS-002',
      severity: 'MEDIUM',
      title:    'CORS wildcard origin with credentials:true (browser-blocked but misconfigured)',
      detail:   'Access-Control-Allow-Origin: * combined with credentials:true is rejected by browsers but indicates a misconfigured CORS policy. Some non-browser clients may still exploit this.',
      location: endpoint,
      fix:      'Remove `credentials: true` or use an explicit origin allowlist.',
    });
  }

  return findings;
}
