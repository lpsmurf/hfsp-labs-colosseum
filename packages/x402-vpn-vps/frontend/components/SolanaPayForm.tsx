"use client";
import { useState } from "react";

interface Props {
  receiveAddress: string; // operator's Solana USDC ATA
  amountUsdc:     string; // human-readable e.g. "0.79"
  onVerified:     (txSignature: string) => void;
  disabled?:      boolean;
}

export function SolanaPayForm({ receiveAddress, amountUsdc, onVerified, disabled }: Props) {
  const [sig, setSig]         = useState("");
  const [copied, setCopied]   = useState(false);
  const [checking, setChecking] = useState(false);

  function copyAddress() {
    navigator.clipboard.writeText(receiveAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function submit() {
    const trimmed = sig.trim();
    if (!trimmed || trimmed.length < 80) return;
    setChecking(true);
    // Signature is passed to parent; backend will verify finalization
    onVerified(trimmed);
    setChecking(false);
  }

  return (
    <div className="rounded-lg border border-violet-700 bg-violet-950/20 p-4 space-y-3">
      <p className="text-sm font-semibold text-violet-300">Pay with Solana USDC</p>

      <div className="rounded bg-gray-900 p-3 space-y-3 text-xs">
        <div>
          <p className="text-gray-400 mb-1">Send exactly <span className="text-white font-mono">{amountUsdc} USDC</span> to:</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-violet-300 break-all">{receiveAddress}</p>
            <button onClick={copyAddress}
              className="shrink-0 rounded border border-gray-600 px-2 py-1 text-gray-400 hover:text-white transition">
              {copied ? "✓" : "copy"}
            </button>
          </div>
        </div>
        <p className="text-gray-500">
          Use Phantom, Backpack, Solflare, or any wallet. USDC mint:{" "}
          <span className="font-mono text-gray-400">EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</span>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-400">Paste your transaction signature after sending:</p>
        <input
          type="text"
          value={sig}
          onChange={(e) => setSig(e.target.value)}
          placeholder="5KHmr7w... (88 characters)"
          disabled={disabled}
          className="w-full rounded bg-gray-900 border border-gray-600 px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || checking || sig.trim().length < 80}
          className="w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50">
          {checking ? "Verifying…" : "Verify & Continue →"}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        The backend waits for finalization (~30s) before accepting. Funds stay on Solana.
      </p>
    </div>
  );
}
