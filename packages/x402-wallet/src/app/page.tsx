import { listAgents, listTransactions } from '@/lib/db';
import { StatCard } from '@/components/StatCard';
import { TxTable } from '@/components/TxTable';
import { AgentCard } from '@/components/AgentCard';
import { Zap, Wallet, ArrowDownUp, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const agents = listAgents();
  const recentTxs = listTransactions(undefined, 10);

  const totalSpend = recentTxs.reduce((sum, t) => sum + t.amountUsdc, 0);
  const activeAgents = agents.filter(a => a.status === 'active').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">x402 Control Plane</h1>
        <p className="text-muted-foreground text-sm mt-1">Agent spend, skills, and payment history at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Agents" value={String(activeAgents)} sub={`${agents.length} total`} />
        <StatCard icon={Wallet} label="Total Spend" value={`$${totalSpend.toFixed(2)}`} sub="all time USDC" />
        <StatCard icon={ArrowDownUp} label="Recent Txs" value={String(recentTxs.length)} sub="last 100" />
        <StatCard icon={Zap} label="Products" value="3" sub="VPN · Card · VPS" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recent Transactions</h2>
          <TxTable transactions={recentTxs} />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Agents</h2>
          <div className="space-y-3">
            {agents.length === 0 && (
              <p className="text-muted-foreground text-sm">No agents yet. <a href="/agents" className="text-primary underline">Add one →</a></p>
            )}
            {agents.slice(0, 4).map(a => <AgentCard key={a.id} agent={a} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
