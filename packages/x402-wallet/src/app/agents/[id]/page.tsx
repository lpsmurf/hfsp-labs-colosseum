'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Agent, Skill, X402Transaction } from '@/lib/types';
import { TxTable } from '@/components/TxTable';
import { SkillRow } from '@/components/SkillRow';
import { formatUsdc, formatAddress } from '@/lib/utils';
import { Activity, Wallet, Zap, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface AgentDetail {
  agent: Agent;
  skills: Skill[];
  spend: { totalUsdc: number; txCount: number; last30DaysUsdc: number };
  balance: { solLamports: number; usdcAmount: number };
}

export default function AgentDetailPage() {
  const { id } = useParams() as { id: string };
  const [data, setData] = useState<AgentDetail | null>(null);
  const [txs, setTxs] = useState<X402Transaction[]>([]);

  useEffect(() => {
    fetch(`/api/agents/${id}`).then(r => r.json()).then(setData);
    fetch(`/api/transactions?agentId=${id}`).then(r => r.json()).then(setTxs);
  }, [id]);

  if (!data) return <div className="text-muted-foreground p-6">Loading…</div>;

  const { agent, skills, spend, balance } = data;

  const statusColor = agent.status === 'active' ? 'text-green-400' : agent.status === 'paused' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-muted-foreground text-sm font-mono">{formatAddress(agent.walletAddress)}</p>
        </div>
        <span className={`ml-auto text-sm font-medium ${statusColor}`}>{agent.status}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Wallet className="h-3.5 w-3.5" /> USDC Balance</div>
          <p className="text-xl font-bold">{formatUsdc(balance.usdcAmount)}</p>
          <p className="text-xs text-muted-foreground">{(balance.solLamports / 1e9).toFixed(4)} SOL</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Activity className="h-3.5 w-3.5" /> Total Spend</div>
          <p className="text-xl font-bold">{formatUsdc(spend.totalUsdc)}</p>
          <p className="text-xs text-muted-foreground">{spend.txCount} transactions</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Zap className="h-3.5 w-3.5" /> Last 30 Days</div>
          <p className="text-xl font-bold">{formatUsdc(spend.last30DaysUsdc)}</p>
          <p className="text-xs text-muted-foreground">{skills.filter(s => s.enabled).length} active skills</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Skills & Permissions</h2>
          {skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills installed.</p>
          ) : (
            <div className="space-y-2">
              {skills.map(s => <SkillRow key={s.id} skill={s} />)}
            </div>
          )}
        </div>
        <div className="lg:col-span-2 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Transaction History</h2>
          <TxTable transactions={txs} />
        </div>
      </div>
    </div>
  );
}
