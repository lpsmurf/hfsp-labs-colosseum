"use client";
import { buildWireGuardClientConf } from "../lib/keygen";

interface Props {
  ip:               string;
  serverWgPubKey:   string; // base64 — from backend response
  clientWgPrivKey:  string; // base64 — from user's browser, never sent to backend
  expiresAt:        string;
}

export function VPNDownload({ ip, serverWgPubKey, clientWgPrivKey, expiresAt }: Props) {
  function download() {
    const conf = buildWireGuardClientConf({
      clientPrivateKey: clientWgPrivKey,
      serverPublicKey:  serverWgPubKey,
      serverIp:         ip,
    });
    const blob = new Blob([conf], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "vpn-x402.conf";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-green-700 bg-green-950/20 p-5 space-y-4">
      <h3 className="font-semibold text-green-400">VPN Server Ready</h3>

      <div className="rounded bg-gray-900 p-3 space-y-2 text-xs font-mono">
        <p className="text-gray-400">Server IP</p>
        <p className="text-white">{ip}</p>
      </div>

      <p className="text-sm text-gray-300">
        Expires{" "}
        <span className="font-mono text-white">{new Date(expiresAt).toLocaleString()}</span>.
        Server is automatically destroyed at expiry. No one — including the operator — can access it.
      </p>

      <button onClick={download}
        className="w-full rounded-lg bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-600">
        Download WireGuard Config
      </button>

      <p className="text-xs text-gray-500">
        Your private key + server public key combined into a ready-to-import .conf file.
        Import into WireGuard on any device.
      </p>
    </div>
  );
}
