import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

function truncateAddress(address: string, chars = 4): string {
  return address.length > chars * 2 + 3
    ? `${address.slice(0, chars)}...${address.slice(-chars)}`
    : address;
}

export function WalletWarningBanner() {
  const { publicKey, connected } = useWallet();
  const [copied, setCopied] = useState(false);
  const address = publicKey?.toBase58() ?? '';

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className="rounded-2xl border border-tertiary/30 bg-tertiary/10 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="ms mt-0.5 text-[20px] text-tertiary" aria-hidden>
          warning
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-on-surface">
            Your credentials are tied to this wallet. If you lose access, they cannot be recovered.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
            <span className="font-mono uppercase tracking-wide text-tertiary">
              Connected wallet
            </span>
            {connected && address ? (
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/5 px-3 font-mono text-on-surface transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                title={address}
              >
                {copied ? 'Copied' : truncateAddress(address)}
              </button>
            ) : (
              <span className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/5 px-3 font-mono text-outline">
                Not connected
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WalletWarningBanner;
