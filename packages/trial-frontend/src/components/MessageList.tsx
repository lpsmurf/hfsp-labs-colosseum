import ReactMarkdown from 'react-markdown';
import type { TrialMessage } from '../hooks/useTrialChat';
import { ToolCallCard } from './ToolCallCard';

interface MessageListProps {
  messages: TrialMessage[];
  isStreaming: boolean;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-200 underline decoration-sky-300/60 underline-offset-4"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-black/30 px-1.5 py-0.5 text-[0.85em] text-slate-100">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-lg bg-black/35 p-3 text-xs leading-relaxed">
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function EmptyState() {
  const prompts = [
    'What is SOL doing today?',
    'Check a token mint for safety',
    'Summarize this wallet',
  ];

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10 text-center">
      <div className="max-w-sm space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-sm font-semibold text-sky-100">
          P
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-100">Poly is ready.</p>
          <p className="text-sm leading-6 text-slate-400">
            Ask about Solana prices, wallets, recent transactions, or token safety.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {prompts.map((prompt) => (
            <span key={prompt} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
              {prompt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 [animation-delay:240ms]" />
      <span className="sr-only">Poly is typing</span>
    </div>
  );
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  if (messages.length === 0) return <EmptyState />;

  return (
    <div className="space-y-5 px-3 py-4 sm:px-4">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        const showTyping = !isUser && message.status === 'streaming' && !message.content;

        return (
          <article key={message.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-xs font-semibold text-sky-100">
                P
              </div>
            )}

            <div className={`min-w-0 max-w-[86%] sm:max-w-[76%] ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  isUser
                    ? 'rounded-br-md bg-slate-200 text-slate-950'
                    : 'rounded-bl-md border border-white/10 bg-slate-900 text-slate-100'
                }`}
              >
                {showTyping ? <TypingIndicator /> : <MarkdownMessage content={message.content} />}
              </div>

              {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
                <div className="space-y-2">
                  {message.toolCalls.map((toolCall) => (
                    <ToolCallCard key={toolCall.id} toolCall={toolCall} />
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}

      {isStreaming && messages[messages.length - 1]?.role === 'user' && (
        <article className="flex justify-start gap-3">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-xs font-semibold text-sky-100">
            P
          </div>
          <div className="rounded-2xl rounded-bl-md border border-white/10 bg-slate-900 px-4 py-3">
            <TypingIndicator />
          </div>
        </article>
      )}
    </div>
  );
}

export default MessageList;
