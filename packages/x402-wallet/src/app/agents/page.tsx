'use client';

import { useEffect, useState } from 'react';
import type { Agent } from '@/lib/types';
import { AgentCard } from '@/components/AgentCard';
import { AddAgentDialog } from '@/components/AddAgentDialog';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);

  const load = () => fetch('/api/agents').then(r => r.json()).then(setAgents);
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage autonomous agents and their wallet identities</p>
        </div>
        <AddAgentDialog onCreated={load} />
      </div>

      {agents.length === 0 ? (
        <div className="border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">No agents yet. Add an agent to start tracking payments.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map(a => <AgentCard key={a.id} agent={a} detailed />)}
        </div>
      )}
    </div>
  );
}
