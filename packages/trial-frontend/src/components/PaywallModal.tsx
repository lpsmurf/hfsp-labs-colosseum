import { useEffect, useMemo, useState } from 'react';

type DeploymentState = 'idle' | 'connecting' | 'opening' | 'connected' | 'error';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  latestSolPrice?: number | null;
}

interface PhantomProvider {
  isPhantom?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58: () => string } }>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildPhantomConnectUrl() {
  const origin = window.location.origin;
  const redirect = `${origin}/try?phantom=connected`;
  const params = new URLSearchParams({
    app_url: origin,
    redirect_link: redirect,
    cluster: 'mainnet-beta',
  });
  return `https://phantom.app/ul/v1/connect?${params.toString()}`;
}

function formatUsd(value: number | null | undefined) {
  if (!value) return 'Waiting for live SOL price';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} / SOL`;
}

export function PaywallModal({ open, onClose, latestSolPrice }: PaywallModalProps) {
  const [state, setState] = useState<DeploymentState>('idle');
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState('');
  const monthlyUsd = useMemo(() => {
    if (!latestSolPrice) return null;
    return latestSolPrice * 0.5;
  }, [latestSolPrice]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setState('idle');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  async function deployWithPhantom() {
    setError('');
    const provider = window.solana?.isPhantom ? window.solana : null;

    if (!provider) {
      setState('opening');
      window.location.href = isMobile() ? buildPhantomConnectUrl() : 'https://phantom.app/download';
      return;
    }

    setState('connecting');
    try {
      const response = await provider.connect();
      const publicKey = response.publicKey.toBase58();
      setWallet(publicKey);
      window.sessionStorage.setItem('clawdrop_trial_wallet', publicKey);
      setState('connected');
    } catch (connectError) {
      const message =
        connectError instanceof Error
          ? connectError.message
          : 'Phantom connection was cancelled.';
      setError(message);
      setState('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-3 sm:items-center sm:px-6" role="presentation">
      <button
        type="button"
        aria-label="Close paywall"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default focus-visible:outline-none"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-lg border border-white/10 bg-slate-950 p-5 text-slate-100 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Trial complete</p>
            <h2 id="paywall-title" className="text-2xl font-bold tracking-tight text-white">
              Loved Poly? Get your own.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-md px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          Deploy a private Poly agent on Solana. 0.5 SOL/month.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-slate-400">Live SOL price</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatUsd(latestSolPrice)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-slate-400">Monthly estimate</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {monthlyUsd ? `$${monthlyUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '0.5 SOL'}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {['Private Telegram bot', 'All 5 Solana tools', '24/7 uptime'].map((feature) => (
            <div key={feature} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-sky-300" aria-hidden="true" />
              <span className="text-sm text-slate-200">{feature}</span>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100">
            {error}
          </p>
        )}

        {state === 'connected' && (
          <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm text-emerald-100">
            Phantom connected: {wallet.slice(0, 4)}...{wallet.slice(-4)}. Deployment checkout is ready for backend wiring.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void deployWithPhantom()}
            disabled={state === 'connecting'}
            className="min-h-12 rounded-lg bg-sky-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-wait disabled:opacity-70"
          >
            {state === 'connecting' ? 'Connecting Phantom...' : state === 'opening' ? 'Opening Phantom...' : 'Deploy with Phantom →'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-lg px-4 text-sm font-medium text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            Keep exploring later
          </button>
        </div>
      </section>
    </div>
  );
}

export default PaywallModal;
