import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';

// Checking header presence only — the critical bypass pattern
const PRESENCE_ONLY = [
  {
    re: /if\s*\(\s*req\.headers\s*\[['"]x-payment['"]\]\s*\)/gi,
    label: 'Checks `req.headers["x-payment"]` existence without verifying the value',
  },
  {
    re: /if\s*\(\s*!?\s*payment(?:Header|Sig|Signature)?\s*\)\s*\{?\s*(?:return|res\.|next)/gi,
    label: 'Gates on payment header presence without calling a verify/settlement function',
  },
  {
    re: /x.payment.*?&&(?:(?!verify|settle|facilitator|signature|decode|validate).){0,120}(?:200|next\(|res\.json|res\.send)/gis,
    label: 'X-PAYMENT header check flows directly to 200 response with no verification call in between',
  },
];

// Positive signals that suggest real verification is happening
const VERIFY_SIGNALS = /verify|settle|facilitator|decode|signature|validatePayment|processPayment/gi;

export function checkPaymentBypass(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  if (/\.(test|spec)\.|node_modules|\.lock$/.test(path)) return findings;
  // Only check server-side files likely to handle payments
  if (!/\.(ts|js|mjs|cjs)$/.test(path)) return findings;

  const hasVerify = VERIFY_SIGNALS.test(content);
  VERIFY_SIGNALS.lastIndex = 0;

  for (const { re, label } of PRESENCE_ONLY) {
    if (re.test(content)) {
      re.lastIndex = 0;
      findings.push({
        id:       'STATIC-PAY-001',
        severity: hasVerify ? 'MEDIUM' : 'CRITICAL',
        title:    'Payment header checked for presence only — potential bypass',
        detail:   `${label}. ${hasVerify ? 'A verification function is present elsewhere in the file — confirm it is actually called before serving content.' : 'No verification/settlement call detected. Any non-empty X-PAYMENT value may return paid content for free.'}`,
        location: path,
        fix:      'Use an x402 facilitator or verify the payment signature + settlement on-chain before returning protected content. Reject with 402 on failure.',
      });
    }
    re.lastIndex = 0;
  }

  return findings;
}
