"use client";
import { useState, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WireGuardKeygen } from "../../components/WireGuardKeygen";
import { PayButton } from "../../components/PayButton";
import { VPNDownload } from "../../components/VPNDownload";
import { vpnClaim } from "../../lib/x402Client";
import type { WireGuardKeypair } from "../../lib/keygen";
import type { VpnPeriod, Region } from "../../lib/x402Client";

type Step = "keygen" | "pay" | "done";

const PERIODS: { id: VpnPeriod; label: string; price: string }[] = [
  { id: "hour",  label: "1 hour",   price: "0.20" },
  { id: "day",   label: "24 hours", price: "0.79" },
  { id: "week",  label: "7 days",   price: "2.99" },
  { id: "month", label: "30 days",  price: "7.99" },
];

const REGIONS: { id: Region; label: string }[] = [
  { id: "DE_NBG", label: "🇩🇪 Germany (Nuremberg)"  },
  { id: "FI_HEL", label: "🇫🇮 Finland (Helsinki)"   },
  { id: "US_HIL", label: "🇺🇸 US West (Hillsboro)"  },
  { id: "SG_SIN", label: "🇸🇬 Singapore"            },
];

export default function VpnPage() {
  const [period, setPeriod] = useState<VpnPeriod>("week");
  const [region, setRegion] = useState<Region>("DE_NBG");
  const [step, setStep]     = useState<Step>("keygen");
  const [wgKeypair, setWgKeypair] = useState<WireGuardKeypair | null>(null);
  const [result, setResult]       = useState<{ ip: string; serverWgPubKey: string; expiresAt: string } | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const onKeygenReady = useCallback((kp: WireGuardKeypair) => {
    setWgKeypair(kp);
    setStep("pay");
  }, []);

  async function handlePay() {
    if (!wgKeypair) return;
    setError(null);
    const res = await vpnClaim({ region, period, clientWgPublicKey: wgKeypair.publicKey });
    if (!res.ok || !res.data) { setError(res.error ?? "Payment or provisioning failed"); return; }
    setResult({ ...res.data, expiresAt: res.expiresAt ?? "" });
    setStep("done");
  }

  const selected = PERIODS.find(p => p.id === period)!;

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">VPN Pass</h1>
          <ConnectButton />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${period === p.id ? "border-indigo-500 bg-indigo-950 text-indigo-300" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
              <span className="block">{p.label}</span>
              <span className="block text-xs opacity-70">${p.price} USDC</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2">
          {REGIONS.map(r => (
            <button key={r.id} onClick={() => setRegion(r.id)}
              className={`rounded-lg border px-4 py-2.5 text-left text-sm transition ${region === r.id ? "border-indigo-500 bg-indigo-950 text-indigo-300" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Step 1: generate WireGuard keypair in browser */}
        <WireGuardKeygen onReady={onKeygenReady} />

        {/* Step 2: pay via x402 — single click, wallet signs USDC transfer */}
        {(step === "pay" || step === "done") && (
          <PayButton
            label={`Buy ${selected.label} VPN — $${selected.price} USDC`}
            price={selected.price}
            onPaid={handlePay}
            disabled={step !== "pay"}
          />
        )}

        {/* Step 3: download WireGuard config */}
        {step === "done" && result && wgKeypair && (
          <VPNDownload
            ip={result.ip}
            serverWgPubKey={result.serverWgPubKey}
            clientWgPrivKey={wgKeypair.privateKey}
            expiresAt={result.expiresAt}
          />
        )}

        {error && (
          <p className="rounded-lg border border-red-700 bg-red-950/20 p-3 text-sm text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
