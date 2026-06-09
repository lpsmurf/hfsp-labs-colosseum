import Link from 'next/link';
import type { Agent } from '@/lib/types';
import { formatAddress, formatDate } from '@/lib/utils';
import { Circle } from 'lucide-react';

interface Props { agent: Agent; detailed?: boolean }

const statusColor: Record<Agent['status'], string> = {
  active:  'text-green-400',
  paused:  'text-yellow-400',
  stopped: 'text-red-400',
};

export function AgentCard({ agent, detailed }: Props) {
  return (
    <Link href={`/agents/${agent.id}`} className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{agent.name}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatAddress(agent.walletAddress)}</p>
        </div>
        <span className={`flex items-center gap-1 text-xs ${statusColor[agent.status]}`}>
          <Circle className="h-2 w-2 fill-current" />
          {agent.status}
        </span>
      </div>
      {detailed && agent.description && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{agent.description}</p>
      )}
      {detailed && (
        <p className="text-xs text-muted-foreground mt-2">Added {formatDate(agent.createdAt)}</p>
      )}
    </Link>
  );
}
