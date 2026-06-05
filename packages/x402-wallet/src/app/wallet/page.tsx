'use client';

import { useEffect, useState } from 'react';
import type { Agent } from '@/lib/types';
import type { HeliusTx } from '@/lib/helius';
import { formatUsdc, formatAddress, formatDate } from '@/lib/utils';
import { ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';

interface WalletData {
  address: string;
  balance: { solLamports: number; usdcAmount: number };
  recentTxs: HeliusTx[];
}

export default function WalletPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then((a: Agent[]) => {
      setAgents(a);
      if (a[0]) setSelected(a[0].walletAddress);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetch(`/api/wallet?address=${selected}`)
      .then(r => r.json())
      .then(setWalletData)
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Wallet Console</h1>
          <p className="text-muted-foreground text-sm mt-1">Live balances and USDC payment history per agent</p>
        </div>
        <button
          onClick={() => setSelected(s => s)}
          className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded-md text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {agents.map(a => (
          <button
            key={a.walletAddress}
            onClick={() => setSelected(a.walletAddress)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              selected === a.walletAddress
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {walletData && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-xs text-muted-foreground mb-1">USDC Balance</p>
              <p className="text-3xl font-bold">{formatUsdc(walletData.balance.usdcAmount)}</p>
              <p className="text-xs text-muted-foreground font-mono mt-2">{formatAddress(walletData.address)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-xs text-muted-foreground mb-1">SOL Balance</p>
              <p className="text-3xl font-bold">{(walletData.balance.solLamports / 1e9).toFixed(4)}</p>
              <p className="text-xs text-muted-foreground mt-2">for transaction fees</p>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recent USDC Activity</h2>
            <div className="bg-card border border-border rounded-lg divide-y divide-border">
              {walletData.recentTxs.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No USDC transactions found.</p>
              )}
              {walletData.recentTxs.map(tx => (
                <div key={tx.signature} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    {tx.usdcDelta < 0
                      ? <ArrowUpRight className="h-4 w-4 text-red-400" />
                      : <ArrowDownLeft className="h-4 w-4 text-green-400" />
                    }
                    <div>
                      <p className="text-sm font-mono">{formatAddress(tx.signature)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(tx.blockTime)}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-medium ${tx.usdcDelta < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {tx.usdcDelta < 0 ? '-' : '+'}{formatUsdc(Math.abs(tx.usdcDelta))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
