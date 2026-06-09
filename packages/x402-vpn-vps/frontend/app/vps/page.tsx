"use client";
import { useState, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SSHKeygen } from "../../components/SSHKeygen";
import { PayButton } from "../../components/PayButton";
import { VPSCredentials } from "../../components/VPSCredentials";
import { vpsClaim } from "../../lib/x402Client";
import type { SSHKeypair } from "../../lib/keygen";
import type { VpsPeriod, Region } from "../../lib/x402Client";

type Step = "keygen" | "pay" | "done";

const PERIODS: { id: VpsPeriod; label: string; price: string }[] = [
  { id: "hour", label: "1 hour",   price: "0.25" },
  { id: "day",  label: "24 hours", price: "0.79" },
  { id: "week", label: "7 days",   price: "3.99" },
];

const REGIONS: { id: Region; label: string }[] = [
  { id: "DE_NBG", label: "🇩🇪 Germany (Nuremberg)"  },
  { id: "FI_HEL", label: "🇫🇮 Finland (Helsinki)"   },
  { id: "US_HIL", label: "🇺🇸 US West (Hillsboro)"  },
  { id: "SG_SIN", label: "🇸🇬 Singapore"            },
];

export default function VpsPage() {
  const [period, setPeriod] = useState<VpsPeriod>("day");
  const [region, setRegion] = useState<Region>("DE_NBG");
  const [step, setStep]     = useState<Step>("keygen");
  const [sshKeypair, setSshKeypair] = useState<SSHKeypair | null>(null);
  const [result, setResult]         = useState<{ ip: string; wireguardClientConf: string; expiresAt: string } | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const onKeygenReady = useCallback((kp: SSHKeypair) => {
    setSshKeypair(kp);
    setStep("pay");
  }, []);

  async function handlePay() {
    if (!sshKeypair) return;
    setError(null);
    const res = await vpsClaim({ region, period, sshPublicKey: sshKeypair.publicKeyOpenSSH });
    if (!res.ok || !res.data) { setError(res.error ?? "Payment or provisioning failed"); return; }
    setResult({ ...res.data, expiresAt: res.expiresAt ?? "" });
    setStep("done");
  }

  const selected = PERIODS.find(p => p.id === period)!;

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Ephemeral VPS</h1>
          <ConnectButton />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${period === p.id ? "border-blue-500 bg-blue-950 text-blue-300" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
              <span className="block">{p.label}</span>
              <span className="block text-xs opacity-70">${p.price} USDC</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2">
          {REGIONS.map(r => (
            <button key={r.id} onClick={() => setRegion(r.id)}
              className={`rounded-lg border px-4 py-2.5 text-left text-sm transition ${region === r.id ? "border-blue-500 bg-blue-950 text-blue-300" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Step 1: generate SSH keypair in browser */}
        <SSHKeygen onReady={onKeygenReady} />

        {/* Step 2: pay via x402 */}
        {(step === "pay" || step === "done") && (
          <PayButton
            label={`Buy ${selected.label} VPS (${region}) — $${selected.price} USDC`}
            price={selected.price}
            onPaid={handlePay}
            disabled={step !== "pay"}
          />
        )}

        {/* Step 3: credentials */}
        {step === "done" && result && (
          <VPSCredentials
            ip={result.ip}
            wireguardClientConf={result.wireguardClientConf}
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
