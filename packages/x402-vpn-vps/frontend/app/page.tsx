import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">x402 Infrastructure</h1>
          <p className="mt-3 text-gray-400">
            Pay USDC on Base. No account. No KYC. ZK-anonymous sessions.
          </p>
        </div>

        <div className="flex justify-center">
          <ConnectButton />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            href="/vpn"
            className="group rounded-xl border border-gray-700 bg-gray-900 p-6 text-left transition hover:border-indigo-500"
          >
            <div className="mb-4 text-3xl">🔒</div>
            <h2 className="text-xl font-semibold text-white group-hover:text-indigo-300">VPN Pass</h2>
            <p className="mt-2 text-sm text-gray-400">
              Anonymous WireGuard VPN. 79 locations. 7-day or 30-day.
            </p>
            <div className="mt-4 space-y-1">
              <p className="text-sm font-medium text-indigo-400">7-day — $3.99 USDC</p>
              <p className="text-sm font-medium text-indigo-400">30-day — $9.99 USDC</p>
            </div>
          </Link>

          <Link
            href="/vps"
            className="group rounded-xl border border-gray-700 bg-gray-900 p-6 text-left transition hover:border-blue-500"
          >
            <div className="mb-4 text-3xl">🖥️</div>
            <h2 className="text-xl font-semibold text-white group-hover:text-blue-300">Ephemeral VPS</h2>
            <p className="mt-2 text-sm text-gray-400">
              Dedicated server on Hetzner. 5 regions. Auto-destroyed at expiry.
            </p>
            <div className="mt-4 space-y-1">
              <p className="text-sm font-medium text-blue-400">24h — $0.99 USDC</p>
              <p className="text-sm font-medium text-blue-400">7-day — $4.99 USDC</p>
            </div>
          </Link>
        </div>

        <p className="text-xs text-gray-600">
          Powered by x402 · Base · Semaphore ZK · VPNResellers · Hetzner
        </p>
      </div>
    </main>
  );
}
