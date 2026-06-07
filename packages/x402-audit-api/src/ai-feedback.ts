import type { AuditReport, Finding } from './report.js';

const ACE_BASE = 'https://api.acedata.cloud';

interface AceChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

export interface AIFeedback {
  summary:          string;   // 2-3 sentence plain-English verdict
  topPriority:      string;   // single most critical thing to fix right now
  recommendations:  string[]; // ordered action list
  riskScore:        number;   // 1-10
  generatedBy:      string;
}

function buildPrompt(report: AuditReport): string {
  const { summary, findings, meta } = report;

  const findingLines = findings.slice(0, 10).map((f: Finding, i: number) =>
    `${i + 1}. [${f.severity}] ${f.title} — ${f.detail.slice(0, 120)} (location: ${f.location})`
  ).join('\n');

  return `You are a blockchain security expert reviewing an x402 payment API.

Repository: ${meta.repo}
Commit: ${meta.commitSha.slice(0, 8)}
Live endpoint: ${meta.liveEndpoint ?? 'not found'}
Static files scanned: ${meta.staticFiles}
Dynamic probing: ${meta.dynamicProbes ? 'yes' : 'no'}

FINDINGS (${summary.total} total — ${summary.critical} critical, ${summary.high} high, ${summary.medium} medium):
${findingLines || 'No issues found.'}

Overall verdict: ${summary.verdict}

Provide a security assessment for the developer who built this service. Be direct and practical.
Respond with exactly this JSON (no markdown, no extra text):
{
  "summary": "2-3 sentences plain English verdict",
  "topPriority": "single most critical action item",
  "recommendations": ["action 1", "action 2", "action 3"],
  "riskScore": 7
}
riskScore must be 1 (safe) to 10 (critical risk). recommendations must be an array of 2-5 strings.`;
}

export async function generateAIFeedback(
  report:      AuditReport,
  aceApiKey:   string,
  facilitatorAddress: string,
): Promise<AIFeedback | null> {
  if (!aceApiKey || !facilitatorAddress) return null;

  try {
    const prompt = buildPrompt(report);

    const res = await fetch(`${ACE_BASE}/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${aceApiKey}`,
        'X-Facilitator': facilitatorAddress,
      },
      body: JSON.stringify({
        model:      'gpt-4o-mini',
        messages:   [{ role: 'user', content: prompt }],
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[ai-feedback] ACE API error: ${res.status}`);
      return null;
    }

    const data = await res.json() as AceChatResponse;
    const raw  = data.choices?.[0]?.message?.content ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();

    const parsed = JSON.parse(clean) as {
      summary?:        string;
      topPriority?:    string;
      recommendations?: string[];
      riskScore?:      number;
    };

    return {
      summary:         parsed.summary         ?? 'Analysis complete.',
      topPriority:     parsed.topPriority      ?? 'Review all findings above.',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      riskScore:       Math.min(10, Math.max(1, Number(parsed.riskScore ?? 5))),
      generatedBy:     'gpt-4o-mini via ACE Data Cloud (x402)',
    };
  } catch (err) {
    console.warn('[ai-feedback] failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
