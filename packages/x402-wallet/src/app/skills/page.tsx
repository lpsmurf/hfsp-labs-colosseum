'use client';

import { useEffect, useState } from 'react';
import type { Agent, Skill } from '@/lib/types';
import { SkillRow } from '@/components/SkillRow';
import { AddSkillDialog } from '@/components/AddSkillDialog';

interface AgentWithSkills { agent: Agent; skills: Skill[] }

export default function SkillsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [skills, setSkills] = useState<Skill[]>([]);

  const loadAgents = () =>
    fetch('/api/agents').then(r => r.json()).then((a: Agent[]) => {
      setAgents(a);
      if (!selected && a[0]) setSelected(a[0].id);
    });

  const loadSkills = (agentId: string) =>
    fetch(`/api/skills?agentId=${agentId}`).then(r => r.json()).then(setSkills);

  useEffect(() => { loadAgents(); }, []);
  useEffect(() => { if (selected) loadSkills(selected); }, [selected]);

  const AVAILABLE_PRODUCTS: Array<{ product: Skill['product']; name: string; desc: string; priceHint: string }> = [
    { product: 'vpn-x402',   name: 'VPN x402',      desc: 'Anonymous WireGuard VPN via x402 USDC payment', priceHint: '$0.50/day' },
    { product: 'gnosis-card', name: 'Gnosis Card',   desc: 'Bridging & managed Visa card onboarding via Gnosis Pay', priceHint: '$5 setup + 0.5% bridge fee' },
    { product: 'vps-x402',   name: 'VPS x402',       desc: 'On-demand cloud VPS provisioning via Hetzner + x402', priceHint: 'usage-based' },
    { product: 'custom',     name: 'Custom Endpoint', desc: 'Any x402-enabled API endpoint with spend policy', priceHint: 'custom' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Skills & Activation</h1>
          <p className="text-muted-foreground text-sm mt-1">Install products, set spend caps, and toggle skills per agent</p>
        </div>
        {selected && <AddSkillDialog agentId={selected} onCreated={() => loadSkills(selected)} />}
      </div>

      <div className="flex gap-2 flex-wrap">
        {agents.map(a => (
          <button
            key={a.id}
            onClick={() => setSelected(a.id)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              selected === a.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Installed Skills</h2>
          {skills.length === 0 ? (
            <div className="border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">No skills installed for this agent.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map(s => <SkillRow key={s.id} skill={s} onToggle={() => loadSkills(selected)} />)}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Available Products</h2>
          <div className="space-y-3">
            {AVAILABLE_PRODUCTS.map(p => (
              <div key={p.product} className="bg-card border border-border rounded-lg p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                  <p className="text-xs text-primary mt-1">{p.priceHint}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  skills.some(s => s.product === p.product)
                    ? 'border-green-500/30 text-green-400 bg-green-500/10'
                    : 'border-border text-muted-foreground'
                }`}>
                  {skills.some(s => s.product === p.product) ? 'installed' : 'available'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
