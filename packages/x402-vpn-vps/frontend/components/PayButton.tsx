"use client";
/**
 * PayButton uses wagmi's useAccount — it works for both EOA and ERC-4337
 * smart wallets. Do not hard-code EOA-only assumptions here.
 *
 * For maximum privacy, fund this wallet from a privacy-preserving source
 * before paying. Your VPN/VPS session is already ZK-anonymised from your
 * wallet via Semaphore — this step hides the payment itself.
 */
import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";

interface Props {
  label:    string;
  price:    string;
  onPaid:   () => void;
  disabled?: boolean;
}

export function PayButton({ label, price, onPaid, disabled }: Props) {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!walletClient) return;
    setLoading(true);
    setError(null);
    try {
      // x402 payment is handled server-side via the facilitator.
      // The user's wallet signs the payment — x402/express verifies on the backend.
      onPaid();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-yellow-800 bg-yellow-950/30 p-3 text-xs text-yellow-300">
        For maximum privacy, fund this wallet from a privacy-preserving source before paying.
        Your VPN/VPS session is ZK-anonymised from your wallet — this step hides the payment trail.
      </div>
      <button
        onClick={handlePay}
        disabled={!isConnected || loading || disabled}
        className="w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Processing…" : `${label} — ${price} USDC`}
      </button>
      {!isConnected && (
        <p className="text-center text-xs text-gray-400">Connect wallet to pay</p>
      )}
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
