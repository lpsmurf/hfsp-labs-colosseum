"use client";
import { useState } from "react";
import { generateWireGuardKeypair, type WireGuardKeypair } from "../lib/keygen";

interface Props {
  onReady: (keypair: WireGuardKeypair) => void;
}

export function WireGuardKeygen({ onReady }: Props) {
  const [keypair, setKeypair]   = useState<WireGuardKeypair | null>(null);
  const [loading, setLoading]   = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const kp = await generateWireGuardKeypair();
      setKeypair(kp);
    } catch {
      setError("Key generation failed — your browser may not support WebCrypto X25519");
    } finally {
      setLoading(false);
    }
  }

  function confirm() {
    if (!keypair) return;
    setConfirmed(true);
    onReady(keypair);
  }

  if (confirmed) {
    return <p className="text-sm font-medium text-green-400">✓ WireGuard keypair saved</p>;
  }

  return (
    <div className="rounded-lg border border-indigo-700 bg-indigo-950/20 p-4 space-y-3">
      <p className="text-sm font-semibold text-indigo-300">Step: Generate your WireGuard keypair</p>
      <p className="text-xs text-gray-400">
        Keys are generated in your browser using WebCrypto. The private key never leaves this page.
      </p>

      {!keypair ? (
        <button onClick={generate} disabled={loading}
          className="w-full rounded-lg border border-indigo-500 px-4 py-2 text-sm text-indigo-300 hover:bg-indigo-950 disabled:opacity-50 transition">
          {loading ? "Generating…" : "Generate WireGuard Keypair"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded bg-gray-900 p-3 space-y-2">
            <div>
              <p className="text-xs text-gray-400 mb-1">Private key <span className="text-yellow-400">(save this — shown once)</span></p>
              <p className="font-mono text-xs text-yellow-300 break-all">{keypair.privateKey}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Public key</p>
              <p className="font-mono text-xs text-green-400 break-all">{keypair.publicKey}</p>
            </div>
          </div>
          <p className="text-xs text-yellow-500">
            ⚠ Copy your private key now. It will not be shown again and is not stored anywhere.
          </p>
          <button onClick={confirm}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition">
            I've saved my private key →
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
