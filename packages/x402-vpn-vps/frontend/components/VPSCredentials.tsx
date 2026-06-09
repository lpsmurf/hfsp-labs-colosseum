"use client";

interface Props {
  ip:                  string;
  wireguardClientConf: string; // base64 — WireGuard access to the VPS
  expiresAt:           string;
  // SSH private key is NOT here — generated in user's browser, never transmitted
}

export function VPSCredentials({ ip, wireguardClientConf, expiresAt }: Props) {
  function downloadWg() {
    const conf = atob(wireguardClientConf);
    const blob = new Blob([conf], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "vps-wireguard.conf";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-blue-700 bg-blue-950/20 p-5 space-y-4">
      <h3 className="font-semibold text-blue-400">VPS Ready</h3>

      <p className="text-sm text-gray-300">
        Lease expires{" "}
        <span className="font-mono text-white">{new Date(expiresAt).toLocaleString()}</span>.
        Server is destroyed automatically at expiry.
      </p>

      <div className="rounded bg-gray-900 p-3 space-y-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">IP Address</p>
          <p className="font-mono text-sm text-white">{ip}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">SSH command</p>
          <code className="text-xs text-green-400">ssh -i vps-x402.pem root@{ip}</code>
        </div>
      </div>

      <button onClick={downloadWg}
        className="w-full rounded-lg border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-950">
        Download WireGuard Config
      </button>

      <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3 text-xs text-gray-400 space-y-1">
        <p className="font-medium text-gray-300">Privacy</p>
        <p>Your SSH private key was generated in your browser and never transmitted. Only you can access this server — server boot takes ~60s before SSH is ready.</p>
      </div>
    </div>
  );
}
