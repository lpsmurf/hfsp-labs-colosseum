"use client";
import { useState } from "react";
import { generateSSHKeypair, type SSHKeypair } from "../lib/keygen";

interface Props {
  onReady: (keypair: SSHKeypair) => void;
}

export function SSHKeygen({ onReady }: Props) {
  const [keypair, setKeypair]   = useState<SSHKeypair | null>(null);
  const [loading, setLoading]   = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const kp = await generateSSHKeypair();
      setKeypair(kp);
    } catch {
      setError("Ed25519 key generation failed — requires Chrome 113+, Firefox 113+, or Safari 17+");
    } finally {
      setLoading(false);
    }
  }

  function downloadKey() {
    if (!keypair) return;
    const blob = new Blob([keypair.privateKeyPem], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "vps-x402.pem";
    a.click();
    URL.revokeObjectURL(url);
  }

  function confirm() {
    if (!keypair) return;
    setConfirmed(true);
    onReady(keypair);
  }

  if (confirmed) {
    return <p className="text-sm font-medium text-green-400">✓ SSH keypair saved</p>;
  }

  return (
    <div className="rounded-lg border border-blue-700 bg-blue-950/20 p-4 space-y-3">
      <p className="text-sm font-semibold text-blue-300">Step: Generate your SSH keypair</p>
      <p className="text-xs text-gray-400">
        Ed25519 keypair generated in your browser. The private key never leaves this page —
        not even the operator can SSH into your server.
      </p>

      {!keypair ? (
        <button onClick={generate} disabled={loading}
          className="w-full rounded-lg border border-blue-500 px-4 py-2 text-sm text-blue-300 hover:bg-blue-950 disabled:opacity-50 transition">
          {loading ? "Generating…" : "Generate SSH Keypair (Ed25519)"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded bg-gray-900 p-3">
            <p className="text-xs text-gray-400 mb-1">Public key (goes to server)</p>
            <p className="font-mono text-xs text-green-400 break-all">{keypair.publicKeyOpenSSH}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={downloadKey}
              className="flex-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 transition">
              Download Private Key (.pem)
            </button>
            <button onClick={confirm}
              className="flex-1 rounded-lg border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950 transition">
              I've saved it →
            </button>
          </div>
          <p className="text-xs text-yellow-500">
            ⚠ Download your private key. Once you proceed it cannot be recovered.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
