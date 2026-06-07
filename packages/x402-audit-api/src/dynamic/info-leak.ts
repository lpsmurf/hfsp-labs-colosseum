import type { Finding } from '../report.js';

const STACKTRACE_MARKERS = [
  'at Object.', 'at Module.', 'Traceback (most recent call last)',
  'java.lang.', 'System.Exception', 'goroutine ', 'panic:',
  '\n    at ', 'webpack-internal',
];

const SENSITIVE_PATTERNS = [
  { re: /\b[A-Z0-9]{32,}\b/, label: 'possible API key in response body' },
  { re: /private.?key|secret.?key/i, label: 'key material referenced in error response' },
  { re: /password\s*[:=]\s*\S+/i, label: 'password value in response body' },
];

async function malformedRequest(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PAYMENT': '}{malformed' },
      body: '}{bad json',
      signal: AbortSignal.timeout(8_000),
    });
    return await res.text();
  } catch {
    return '';
  }
}

export async function probeInfoLeak(endpoint: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const body = await malformedRequest(endpoint);
  if (!body) return findings;

  // Stack trace leak
  const stackMarker = STACKTRACE_MARKERS.find(m => body.includes(m));
  if (stackMarker) {
    findings.push({
      id:       'DYN-INFO-001',
      severity: 'MEDIUM',
      title:    'Stack trace leaked in error response',
      detail:   `A malformed request triggered an unhandled error that leaked a stack trace (marker: "${stackMarker}"). Stack traces reveal internal file paths, framework versions, and code structure useful to an attacker.`,
      location: endpoint,
      fix:      'Catch all errors and return a generic message. Never expose stack traces in production responses.',
    });
  }

  // Sensitive data in response
  for (const { re, label } of SENSITIVE_PATTERNS) {
    if (re.test(body)) {
      findings.push({
        id:       'DYN-INFO-002',
        severity: 'HIGH',
        title:    `Sensitive data in error response: ${label}`,
        detail:   `The error response body appears to contain ${label}. This could expose credentials or internal configuration to an attacker.`,
        location: endpoint,
        fix:      'Sanitize all error responses. Never include raw error objects or configuration values in API responses.',
      });
      break;
    }
  }

  return findings;
}
