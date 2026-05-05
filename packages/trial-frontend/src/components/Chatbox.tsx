import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { TrialChatError, TrialMessage, TrialQuota } from '../hooks/useTrialChat';
import { MessageList } from './MessageList';

interface ChatboxProps {
  messages: TrialMessage[];
  quota: TrialQuota;
  error: TrialChatError | null;
  isStreaming: boolean;
  onSendMessage: (message: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onOpenPaywall: () => void;
  onClearError: () => void;
  className?: string;
}

const QUICK_PROMPTS = [
  'What is the SOL price?',
  'Is JUP looking healthy?',
  'Explain what Poly can do',
];

function errorTitle(error: TrialChatError) {
  if (error.type === 'rate_limit' || error.type === 'quota') return 'Trial limit reached';
  if (error.type === 'server') return 'Poly is taking a breather';
  return 'Connection dropped';
}

export function Chatbox({
  messages,
  quota,
  error,
  isStreaming,
  onSendMessage,
  onRetry,
  onOpenPaywall,
  onClearError,
  className = '',
}: ChatboxProps) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const atQuota = quota.remaining <= 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, isStreaming]);

  async function submitMessage(nextDraft = draft) {
    const message = nextDraft.trim();
    if (!message || isStreaming) return;
    if (atQuota) {
      onOpenPaywall();
      return;
    }
    setDraft('');
    await onSendMessage(message);
    textareaRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submitMessage();
    }
  }

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950/80 shadow-2xl shadow-black/30 ${className}`}
      aria-label="Trial chat with Poly"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">Trial Poly</p>
          <p className="text-xs text-slate-400">Solana tools, live data, no signup</p>
        </div>
        <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-200">
          {quota.used} / {quota.limit}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-busy={isStreaming}>
        <MessageList messages={messages} isStreaming={isStreaming} />
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-3 mb-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-50">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold">{errorTitle(error)}</p>
              <p className="text-amber-100/80">{error.message}</p>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="min-h-10 rounded-md px-3 text-xs font-medium text-amber-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Dismiss
            </button>
          </div>
          {error.type === 'rate_limit' || error.type === 'quota' ? (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="mt-3 min-h-10 rounded-md bg-amber-200 px-3 text-xs font-semibold text-slate-950 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
            >
              Deploy your own Poly
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="mt-3 min-h-10 rounded-md bg-amber-200 px-3 text-xs font-semibold text-slate-950 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
            >
              Retry last message
            </button>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-3">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void submitMessage(prompt)}
              disabled={isStreaming || atQuota}
              className="min-h-10 shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-white/10 bg-slate-950 p-3">
        <div className="space-y-2">
          <label htmlFor="poly-message" className="text-xs font-medium text-slate-300">
            Message Poly
          </label>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              id="poly-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              spellCheck
              disabled={isStreaming || atQuota}
              placeholder={atQuota ? 'Deploy your own Poly to keep chatting' : 'Ask about SOL, wallets, or token safety'}
              className="max-h-36 min-h-12 flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm leading-6 text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              aria-describedby="poly-message-help"
            />
            <button
              type="submit"
              disabled={isStreaming || atQuota || !draft.trim()}
              className="min-h-12 rounded-lg bg-sky-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStreaming ? 'Sending' : 'Send'}
            </button>
          </div>
          <p id="poly-message-help" className="text-xs text-slate-500">
            Press Cmd+Enter to send. {quota.remaining} free {quota.remaining === 1 ? 'message' : 'messages'} left today.
          </p>
        </div>
      </form>
    </section>
  );
}

export default Chatbox;
