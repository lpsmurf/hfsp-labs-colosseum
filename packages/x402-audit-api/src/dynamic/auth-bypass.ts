import type { Finding } from '../report.js';

const FAKE_HEADERS = [
  { label: 'garbage string',   value: 'x' },
  { label: 'numeric string',   value: '12345' },
  { label: 'long garbage',     value: 'a'.repeat(88) },
];

async function probe(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
}

export async function probeAuthBypass(endpoint: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Step 1: establish baseline — endpoint should return 402 with no payment header
  const baseline = await probe(endpoint, {});
  if (!baseline) return []; // unreachable
  if (baseline.status !== 402) return []; // not a gated endpoint

  // Step 2: try fake payment headers — should still get 402
  for (const { label, value } of FAKE_HEADERS) {
    const res = await probe(endpoint, { 'X-PAYMENT': value });
    if (!res) continue;

    if (res.status === 200) {
      findings.push({
        id:       'DYN-AUTH-001',
        severity: 'CRITICAL',
        title:    'Payment bypass confirmed — fake X-PAYMENT header accepted',
        detail:   `Sending a fake "${label}" X-PAYMENT value ("${value.slice(0, 20)}…") returned HTTP 200. The endpoint checks header presence only, not validity. Any non-empty X-PAYMENT value bypasses the payment gate.`,
        location: endpoint,
        fix:      'Verify the payment signature and settlement via an x402 facilitator before serving content. Never gate on header presence alone.',
      });
      break; // one confirmed bypass is enough
    }
  }

  return findings;
}
