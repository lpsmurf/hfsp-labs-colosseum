import { useEffect, useMemo, useState } from 'react';
import { Chatbox } from '../components/Chatbox';
import { PaywallModal } from '../components/PaywallModal';
import type { TrialMessage } from '../hooks/useTrialChat';
import { useTrialChat } from '../hooks/useTrialChat';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findLatestSolPrice(messages: TrialMessage[]) {
  for (const message of [...messages].reverse()) {
    const toolCalls = [...(message.toolCalls ?? [])].reverse();
    for (const toolCall of toolCalls) {
      if (toolCall.name !== 'get_sol_price' || !isRecord(toolCall.result)) continue;
      const price = toolCall.result.price_usd;
      if (typeof price === 'number' && Number.isFinite(price)) return price;
    }
  }
  return null;
}

export function Try() {
  const chat = useTrialChat();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const latestSolPrice = useMemo(() => findLatestSolPrice(chat.messages), [chat.messages]);

  useEffect(() => {
    if (chat.shouldShowPaywall) setPaywallOpen(true);
  }, [chat.shouldShowPaywall]);

  function closePaywall() {
    setPaywallOpen(false);
    chat.dismissPaywall();
  }

  return (
    <main className="dark min-h-[100dvh] bg-slate-950 text-slate-100">
      <div className="mx-auto flex h-[100dvh] max-w-5xl flex-col px-3 py-3 sm:px-5 sm:py-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Clawdrop Trial</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Chat with Poly. Free. No signup.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Ask the shared trial agent about Solana prices, wallets, transactions, and token safety.
            </p>
          </div>

          <div className="shrink-0 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Today</p>
            <p className="text-sm font-semibold text-white">
              {chat.quota.used} / {chat.quota.limit} messages
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 py-4">
          <Chatbox
            messages={chat.messages}
            quota={chat.quota}
            error={chat.error}
            isStreaming={chat.isStreaming}
            onSendMessage={chat.sendMessage}
            onRetry={chat.retryLastMessage}
            onOpenPaywall={() => setPaywallOpen(true)}
            onClearError={chat.clearError}
            className="h-full"
          />
        </div>

        <footer className="pb-[env(safe-area-inset-bottom)] text-center text-xs text-slate-500">
          Powered by Solana ◎
        </footer>
      </div>

      <PaywallModal open={paywallOpen} onClose={closePaywall} latestSolPrice={latestSolPrice} />
    </main>
  );
}

export default Try;
