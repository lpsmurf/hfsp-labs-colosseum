import type { Finding } from '../report.js';

// Live counterpart of STATIC-EXPOSE: fetch what an unpaid, unauthenticated
// caller can see and look for fields that carry goods or credentials. Only
// non-empty string or number values count — a schema that merely names
// `voucher_code` is documentation, not a leak.
//
// Values are never copied into the finding: the report says which field was
// exposed and where, not what it contained.

const SENSITIVE_KEY = /^(?:voucher(?:_?code)?|pin(?:_?serial|_?code)?|redeem_?code|gift_?code|card_?number|cvv|cvc|private_?key|secret(?:_?key)?|api_?key|mnemonic|seed(?:_?phrase)?|password|access_?token|refresh_?token|client_?secret)$/i;

export function sensitiveFields(value: unknown, path = '$', out: string[] = [], depth = 0): string[] {
  if (depth > 12 || out.length >= 20) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => sensitiveFields(v, `${path}[${i}]`, out, depth + 1));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const here = `${path}.${k}`;
      if (SENSITIVE_KEY.test(k) && ((typeof v === 'string' && v.trim() !== '') || typeof v === 'number')) out.push(here);
      else sensitiveFields(v, here, out, depth + 1);
    }
  }
  return out;
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    if (!(res.headers.get('content-type') ?? '').includes('json')) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

export async function probeDataExposure(endpoint: string): Promise<Finding[]> {
  const probes: Array<[string, RequestInit | undefined]> = [
    ['GET', undefined],
    ['POST', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
  ];
  const findings: Finding[] = [];
  for (const [method, init] of probes) {
    const fields = sensitiveFields(await json(endpoint, init));
    if (!fields.length) continue;
    findings.push({
      id:         'DYN-EXPOSE-001',
      severity:   'CRITICAL',
      confidence: 'HIGH',
      title:      `Unauthenticated ${method} response contains sensitive fields`,
      detail:
        `Without paying or authenticating, ${method} ${endpoint} returned values in: ${fields.join(', ')}. ` +
        'Voucher codes, PINs, card numbers and keys in a response are the goods or credentials themselves. ' +
        '(Values are intentionally not included in this report.)',
      location:   `${method} ${endpoint}`,
      fix:        'Return an allowlist of fields. Deliver purchased codes only to the paying buyer, never on an unauthenticated or id-only route.',
      refs:       ['CWE-200', 'OWASP API3:2023 Broken Object Property Level Authorization'],
    });
  }
  return findings;
}
