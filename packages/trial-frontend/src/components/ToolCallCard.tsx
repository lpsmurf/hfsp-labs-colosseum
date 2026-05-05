import { useMemo, useState } from 'react';
import type { TrialToolCall } from '../hooks/useTrialChat';

interface ToolCallCardProps {
  toolCall: TrialToolCall;
}

type ToolTone = {
  label: string;
  border: string;
  bg: string;
  text: string;
  dot: string;
};

const TOOL_TONES: Record<string, ToolTone> = {
  get_sol_price: {
    label: 'SOL price',
    border: 'border-emerald-400/40',
    bg: 'bg-emerald-400/10',
    text: 'text-emerald-100',
    dot: 'bg-emerald-300',
  },
  get_token_price: {
    label: 'Token price',
    border: 'border-emerald-400/40',
    bg: 'bg-emerald-400/10',
    text: 'text-emerald-100',
    dot: 'bg-emerald-300',
  },
  get_wallet_balance: {
    label: 'Wallet balance',
    border: 'border-sky-400/40',
    bg: 'bg-sky-400/10',
    text: 'text-sky-100',
    dot: 'bg-sky-300',
  },
  get_recent_txns: {
    label: 'Recent activity',
    border: 'border-indigo-400/40',
    bg: 'bg-indigo-400/10',
    text: 'text-indigo-100',
    dot: 'bg-indigo-300',
  },
  check_token_safety: {
    label: 'Token safety',
    border: 'border-amber-400/40',
    bg: 'bg-amber-400/10',
    text: 'text-amber-100',
    dot: 'bg-amber-300',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringifyValue(value: unknown) {
  if (value === undefined) return 'Waiting for data...';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(value: string) {
  return value.length > 1400 ? `${value.slice(0, 1400)}\n...truncated` : value;
}

function getSafetyTone(toolCall: TrialToolCall): ToolTone | null {
  if (toolCall.name !== 'check_token_safety' || !isRecord(toolCall.result)) return null;
  const score = toolCall.result.score;
  if (score === 'green') {
    return {
      label: 'Token safety',
      border: 'border-emerald-400/40',
      bg: 'bg-emerald-400/10',
      text: 'text-emerald-100',
      dot: 'bg-emerald-300',
    };
  }
  if (score === 'red') {
    return {
      label: 'Token safety',
      border: 'border-rose-400/40',
      bg: 'bg-rose-400/10',
      text: 'text-rose-100',
      dot: 'bg-rose-300',
    };
  }
  return null;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(toolCall.status !== 'complete');
  const [copied, setCopied] = useState(false);
  const tone = getSafetyTone(toolCall) ?? TOOL_TONES[toolCall.name] ?? {
    label: toolCall.name.replace(/_/g, ' '),
    border: 'border-slate-500/50',
    bg: 'bg-slate-800/70',
    text: 'text-slate-100',
    dot: 'bg-slate-300',
  };

  const resultText = useMemo(() => truncate(stringifyValue(toolCall.result ?? toolCall.error)), [toolCall.error, toolCall.result]);
  const inputText = useMemo(() => truncate(stringifyValue(toolCall.input)), [toolCall.input]);
  const isLoading = toolCall.status === 'pending' || toolCall.status === 'running';

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`mt-3 overflow-hidden rounded-lg border ${tone.border} ${tone.bg}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${isLoading ? 'animate-pulse' : ''} ${tone.dot}`} />
          <span className={`truncate text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
            {tone.label}
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-300">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 px-3 py-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Input</p>
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/25 p-2 text-xs leading-relaxed text-slate-200">
              {inputText}
            </pre>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Result</p>
              <button
                type="button"
                onClick={copyResult}
                className="min-h-10 rounded-md px-3 text-xs font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/25 p-2 text-xs leading-relaxed text-slate-100">
              {resultText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolCallCard;
