/**
 * TypeSafe (Jev) triage for scanner hits.
 *
 * The regex scanner is a high-recall funnel; this layer asks Jev calibrated
 * questions about the raw evidence and returns confirm / dismiss / review.
 * Only "review" needs a human (or Claude). Disabled when TYPESAFE_API_KEY is unset.
 *
 * Privacy: bodies are truncated and matched secrets are masked before leaving
 * the machine — never send exploit details for unpublished findings.
 */

import { TypeSafeClient, choice, noul } from '@typesafe-ai/sdk';

export type Check = 'fake_payment' | 'alt_method' | 'secret' | 'stack_trace';
export type Decision = 'confirm' | 'dismiss' | 'review';

export interface HttpSample {
  status: number;
  contentType: string;
  body: string;
}

export interface Evidence {
  url: string;
  method: string;
  check: Check;
  baseline: HttpSample;   // request with no X-PAYMENT header
  probe: HttpSample;      // the request that triggered the regex hit
  probeLabel?: string;    // e.g. "X-PAYMENT: garbage88" or "GET instead of POST"
  match?: string;         // secret / stack-trace substring the regex matched
}

export interface TriageResult {
  decision: Decision;
  findingClass: FindingClass;
  classConfidence: number;
  paidContent: number;    // P(probe body is paid data)
  liveSecret?: number;    // P(match is a live credential)
  stackTrace?: number;    // P(body leaks a server stack trace / internals)
  model: string;
  inputTokens: number;
  latencyMs: number;
}

export interface Thresholds {
  confirm: number;        // class confidence / probability needed to auto-confirm
  dismiss: number;        // class confidence needed to auto-dismiss
}

export const DEFAULT_THRESHOLDS: Thresholds = { confirm: 0.8, dismiss: 0.8 };

const BODY_LIMIT = 2000;

const FINDING_CLASSES = {
  real_bypass: 'The probe response serves the paid resource (real data the endpoint charges for) without a valid payment',
  discovery_doc: 'The probe response is a public discovery document: service manifest, OpenAPI spec, A2A agent card, x402 payment requirements, HTML landing page, or usage/help text',
  error_envelope: 'The probe response is an error or rejection message (e.g. "invalid payment", "missing parameter") even though the HTTP status is 200',
  free_route: 'The endpoint is not payment-gated at all: the baseline request without payment already returns the same content',
  other: 'None of the above describes the probe response',
} as const;

export type FindingClass = keyof typeof FINDING_CLASSES;

const CONTEXT =
  'Context: x402 is an HTTP payment protocol. A paid endpoint returns HTTP 402 with payment requirements ' +
  'when no X-PAYMENT header is sent, and must only return the paid resource after verifying a real payment. ' +
  'The scanner sent deliberately fake or missing payments; the state contains the baseline (no payment) ' +
  'response and the probe response.';

let client: TypeSafeClient | null | undefined;

function getClient(): TypeSafeClient | null {
  if (client === undefined) {
    client = process.env.TYPESAFE_API_KEY ? new TypeSafeClient({ timeout: 15_000 }) : null;
  }
  return client;
}

export function triageEnabled(): boolean {
  return getClient() !== null;
}

/** Keep the first 8 and last 4 chars of a matched secret; mask the rest. */
export function maskSecret(text: string, match: string): string {
  if (match.length <= 14) return text;
  const masked = match.slice(0, 8) + '•'.repeat(match.length - 12) + match.slice(-4);
  return text.split(match).join(masked);
}

function sample(s: HttpSample, match?: string) {
  const body = s.body.slice(0, BODY_LIMIT);
  return {
    status: s.status,
    content_type: s.contentType,
    body: match ? maskSecret(body, match) : body,
    truncated: s.body.length > BODY_LIMIT,
  };
}

export async function triage(ev: Evidence, t: Thresholds = DEFAULT_THRESHOLDS): Promise<TriageResult | null> {
  const c = getClient();
  if (!c) return null;

  const matchContext = ev.match ? maskSecret(contextAround(ev.probe.body, ev.match), ev.match) : undefined;
  const state = {
    check: ev.check,
    request: { url: ev.url, method: ev.method, probe: ev.probeLabel ?? null },
    baseline_response: sample(ev.baseline, ev.match),
    probe_response: sample(ev.probe, ev.match),
    ...(matchContext ? { regex_match_in_context: matchContext } : {}),
  };

  const questions = {
    finding_class: choice(`${CONTEXT} Classify what the probe response actually is.`, FINDING_CLASSES),
    paid_content: noul(`${CONTEXT} The probe response body contains the endpoint's paid data (real results), not a manifest, help text, error message or payment requirements.`),
    ...(ev.check === 'secret' ? {
      live_secret: noul('The regex match is a live, private credential (secret API key, private key, session token, internal IP) — not a publishable/public key, transaction hash, content hash, address, or placeholder example.'),
    } : {}),
    ...(ev.check === 'stack_trace' ? {
      stack_trace: noul('The probe response leaks a server-side stack trace, exception dump, or internal file paths of the server.'),
    } : {}),
  };

  const started = Date.now();
  const res = await c.systemOne({ state, questions });
  const latencyMs = Date.now() - started;

  const a = res.answers as Record<string, { type: string; noul?: number; choice?: string; confidence?: number }>;
  const findingClass = a.finding_class.choice as FindingClass;
  const classConfidence = a.finding_class.confidence ?? 0;
  const paidContent = a.paid_content.noul ?? 0;
  const liveSecret = a.live_secret?.noul;
  const stackTrace = a.stack_trace?.noul;

  return {
    decision: decide(ev.check, { findingClass, classConfidence, paidContent, liveSecret, stackTrace }, t),
    findingClass, classConfidence, paidContent, liveSecret, stackTrace,
    model: res.model,
    inputTokens: res.usage.input_tokens,
    latencyMs,
  };
}

export function decide(
  check: Check,
  r: { findingClass: FindingClass; classConfidence: number; paidContent: number; liveSecret?: number; stackTrace?: number },
  t: Thresholds,
): Decision {
  if (check === 'secret' || check === 'stack_trace') {
    const p = (check === 'secret' ? r.liveSecret : r.stackTrace) ?? 0.5;
    if (p >= t.confirm) return 'confirm';
    if (p <= 1 - t.dismiss) return 'dismiss';
    return 'review';
  }
  // Bypass-style checks: both the class and the paid-content question must agree
  // before we auto-confirm; auto-dismiss only on a confident non-bypass class.
  if (r.findingClass === 'real_bypass') {
    return r.classConfidence >= t.confirm && r.paidContent >= 0.5 ? 'confirm' : 'review';
  }
  if (r.findingClass === 'other') return 'review';
  // A free route serves real data by definition — it was never gated, so paid content is expected.
  if (r.findingClass === 'free_route') return r.classConfidence >= t.dismiss ? 'dismiss' : 'review';
  return r.classConfidence >= t.dismiss && r.paidContent < 0.5 ? 'dismiss' : 'review';
}

function contextAround(text: string, match: string, radius = 120): string {
  const i = text.indexOf(match);
  if (i < 0) return match;
  return text.slice(Math.max(0, i - radius), i + match.length + radius);
}
