/**
 * Shadow-mode ledger: Jev verdicts recorded next to the regex result, plus
 * manual-verification labels. Contains no response bodies.
 */

import { createHash } from 'crypto';
import { join } from 'path';
import type { Check, Decision, TriageResult } from '../lib/typesafe-triage';

export const SHADOW_LOG = join(__dirname, '..', '..', 'eval', 'shadow-log.jsonl');
export const SHADOW_LABELS = join(__dirname, '..', '..', 'eval', 'shadow-labels.jsonl');

export interface ShadowRow {
  id: string;             // stable per endpoint + check, shared across runs
  runAt: string;
  serviceId: string;
  url: string;
  check: Check;
  regexFlag: boolean;
  jev: Omit<TriageResult, 'inputTokens' | 'latencyMs'>;
  disagree: boolean;
}

export interface ShadowLabel { id: string; real: boolean; note?: string; labeledAt: string }

export function shadowId(url: string, check: Check): string {
  return createHash('sha1').update(`${url}::${check}`).digest('hex').slice(0, 8);
}

/** Regex flagged but Jev dismisses it, or regex passed but Jev confirms it. */
export function disagrees(regexFlag: boolean, decision: Decision): boolean {
  return regexFlag ? decision === 'dismiss' : decision === 'confirm';
}

export function shadowRow(runAt: string, serviceId: string, url: string,
  t: { check: Check; regexFlag: boolean } & TriageResult): ShadowRow {
  const { inputTokens, latencyMs, check, regexFlag, ...jev } = t;
  return { id: shadowId(url, check), runAt, serviceId, url, check, regexFlag, jev, disagree: disagrees(regexFlag, t.decision) };
}
