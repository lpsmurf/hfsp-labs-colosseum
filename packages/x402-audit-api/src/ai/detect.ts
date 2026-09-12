import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../config.js';
import { SYSTEM_PROMPT, buildDetectPrompt } from './prompt.js';

// AI detection pass.
//
// This is a *detector*, not the summariser in ai-feedback.ts. The distinction
// matters: the summariser is handed findings the static engines already produced
// and never sees a line of source, so it cannot add a single finding. This reads
// the code.
//
// Every finding from here is an unverified hypothesis and is labelled as one.
// Confidence is never HIGH — we have no proof, only an argument — and anything
// citing a file or line we did not send is dropped rather than reported. A
// scanner that forwards hallucinated findings to a customer is worse than one
// that finds nothing.

export interface AiDetectMeta {
  model:        string;
  filesSent:    number;
  filesOmitted: number;
  charsSent:    number;
  /** Findings discarded because they cited code we never sent. */
  rejected:     number;
  error?:       string;
}

export interface AiDetectResult {
  findings: Finding[];
  meta:     AiDetectMeta;
}

export interface RawFinding {
  file?:       string;
  line_start?: number;
  line_end?:   number;
  severity?:   string;
  title?:      string;
  exploit?:    string;
  impact?:     string;
  fix?:        string;
}

// Character budget for the source listing. ~160k chars is roughly 40k tokens,
// which leaves generous room for the response on any current model.
const CHAR_BUDGET = Number(config.AI_DETECT_CHAR_BUDGET ?? 160_000);

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface Transport {
  name: string;
  call(system: string, user: string): Promise<string>;
}

function anthropicTransport(apiKey: string, model: string): Transport {
  return {
    name: model,
    async call(system, user) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as { content?: Array<{ text?: string }> };
      return data.content?.map(c => c.text ?? '').join('') ?? '';
    },
  };
}

// ACE Data Cloud fronts OpenAI and is itself paid over x402, which is why it is
// here — the audit service buying its own inference through the protocol it
// audits. Kept as the fallback path.
function aceTransport(apiKey: string, facilitator: string, model: string): Transport {
  return {
    name: `${model} via ACE`,
    async call(system, user) {
      const res = await fetch('https://api.acedata.cloud/openai/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Facilitator': facilitator,
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: user },
          ],
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`ACE ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

// OpenRouter: one key, one bill, every model. Best choice for comparing
// detection quality before committing to a provider.
function openRouterTransport(apiKey: string, model: string): Transport {
  return {
    name: `${model} via OpenRouter`,
    async call(system, user) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Title':       'x402-audit-api',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: user },
          ],
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

// No provider. Write the prompt out, read a reply back in. Lets a person — or a
// chat session — answer as the model, so the detection approach can be judged
// before paying for inference. The grounding and parsing path is identical to a
// live call, which is the point: what is validated here is what ships.
function fileTransport(): Transport {
  return {
    name: 'file (manual)',
    async call(system, user) {
      writeFileSync(
        config.AI_DETECT_PROMPT_PATH,
        `===== SYSTEM =====\n${system}\n\n===== USER =====\n${user}\n`,
        'utf8',
      );
      console.log(`[ai-detect] prompt written to ${config.AI_DETECT_PROMPT_PATH}`);
      try {
        return readFileSync(config.AI_DETECT_RESPONSE_PATH, 'utf8');
      } catch {
        throw new Error(
          `Prompt written to ${config.AI_DETECT_PROMPT_PATH}. ` +
          `Answer it and save the JSON to ${config.AI_DETECT_RESPONSE_PATH}, then re-run.`,
        );
      }
    },
  };
}

function pickTransport(): Transport | null {
  if (config.AI_DETECT_MODE === 'file') return fileTransport();

  // OpenRouter first when present: one key across providers.
  if (config.OPENROUTER_API_KEY) {
    return openRouterTransport(config.OPENROUTER_API_KEY, config.AI_DETECT_MODEL);
  }
  // Anthropic direct when available — detection quality is model-bound, and
  // this is the capable path.
  if (config.ANTHROPIC_API_KEY) {
    return anthropicTransport(config.ANTHROPIC_API_KEY, config.AI_DETECT_MODEL);
  }
  if (config.ACEDATA_API_KEY && config.ACEDATA_FACILITATOR_ADDRESS) {
    return aceTransport(
      config.ACEDATA_API_KEY,
      config.ACEDATA_FACILITATOR_ADDRESS,
      config.AI_DETECT_MODEL_FALLBACK,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parsing and grounding
// ---------------------------------------------------------------------------

export function extractJson(raw: string): RawFinding[] {
  // Models add fences and preamble despite instructions. Take the outermost
  // object and parse that.
  const fenced = raw.replace(/```(?:json)?/g, '').trim();
  const start  = fenced.indexOf('{');
  const end    = fenced.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as { findings?: RawFinding[] };
    return Array.isArray(parsed.findings) ? parsed.findings : [];
  } catch {
    return [];
  }
}

function normalizeSeverity(s: string | undefined): Finding['severity'] {
  const v = (s ?? '').toLowerCase();
  if (v === 'critical') return 'CRITICAL';
  // The prompt only sanctions critical and high. Anything else is a finding the
  // model was told not to report, so it lands at HIGH rather than being
  // silently promoted or dropped.
  return 'HIGH';
}

/**
 * Keep only findings that point at code we actually sent.
 *
 * A model can cite a plausible-looking file that is not in the repo, or a line
 * beyond the end of one that is. Both are hallucinations and neither is
 * reportable. Line-range validity also sets confidence: a checkable range earns
 * MEDIUM, a file-only match earns LOW. Never HIGH — nothing here is verified.
 */
export function groundFindings(raw: RawFinding[], sent: RepoFile[]): { findings: Finding[]; rejected: number } {
  const lineCount = new Map(sent.map(f => [f.path, f.content.split('\n').length]));
  const byBasename = new Map<string, string>();
  for (const f of sent) {
    const b = f.path.split('/').pop();
    if (b && !byBasename.has(b)) byBasename.set(b, f.path);
  }

  const findings: Finding[] = [];
  let rejected = 0;

  for (const r of raw) {
    if (!r.title || !r.file) { rejected++; continue; }

    // Resolve the cited path, tolerating a bare filename.
    const path = lineCount.has(r.file)
      ? r.file
      : byBasename.get(r.file.split('/').pop() ?? '') ?? null;
    if (!path) { rejected++; continue; }

    const lines = lineCount.get(path)!;
    const start = Number(r.line_start);
    const end   = Number(r.line_end);
    const rangeOk =
      Number.isInteger(start) && start >= 1 && start <= lines &&
      (!Number.isInteger(end) || (end >= start && end <= lines + 1));

    const where = rangeOk
      ? `${path}:${start}${Number.isInteger(end) && end > start ? `-${Math.min(end, lines)}` : ''}`
      : path;

    findings.push({
      id:         'AI-DETECT',
      severity:   normalizeSeverity(r.severity),
      // Nothing from a language model is verified. MEDIUM is the ceiling, and
      // only when the cited lines exist.
      confidence: rangeOk ? 'MEDIUM' : 'LOW',
      title:      r.title.trim(),
      detail:
        `Unverified AI finding — read the cited code before acting on it.\n\n` +
        (r.exploit ? `Exploit path: ${r.exploit}\n\n` : '') +
        (r.impact  ? `Impact: ${r.impact}\n\n` : '') +
        (rangeOk ? '' : 'The model did not cite a line range that exists in the file, so only the file is reported.'),
      // Uniqueness lives in the location, not the id, so AI-DETECT stays
      // groupable — the DEP-001 collapse taught us that buildReport dedupes on
      // id plus location.
      location:   where,
      fix:        r.fix?.trim() || 'No remediation proposed. Confirm the finding first, then design the fix against the cited code.',
      refs:       ['AI-generated — unverified'],
    });
  }

  return { findings, rejected };
}

// ---------------------------------------------------------------------------

export async function runAiDetection(files: RepoFile[]): Promise<AiDetectResult> {
  const transport = pickTransport();
  const empty = (error: string, model = 'none'): AiDetectResult => ({
    findings: [],
    meta: { model, filesSent: 0, filesOmitted: 0, charsSent: 0, rejected: 0, error },
  });

  if (!transport) return empty('No AI provider configured (set ANTHROPIC_API_KEY or ACEDATA_API_KEY)');

  const bundle = buildDetectPrompt(files, CHAR_BUDGET);
  if (bundle.included.length === 0) return empty('No analysable source files', transport.name);

  let raw: string;
  try {
    raw = await transport.call(SYSTEM_PROMPT, bundle.prompt);
  } catch (err) {
    // A detection failure must never fail the audit — the static findings are
    // still worth returning.
    return empty(err instanceof Error ? err.message : String(err), transport.name);
  }

  const parsed = extractJson(raw);
  const { findings, rejected } = groundFindings(parsed, bundle.included);

  if (rejected > 0) {
    console.warn(`[ai-detect] dropped ${rejected} ungroundable finding(s) of ${parsed.length}`);
  }

  return {
    findings,
    meta: {
      model:        transport.name,
      filesSent:    bundle.included.length,
      filesOmitted: bundle.omitted,
      charsSent:    bundle.chars,
      rejected,
    },
  };
}
