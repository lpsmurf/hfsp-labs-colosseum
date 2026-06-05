'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Skill } from '@/lib/types';

interface Props { agentId: string; onCreated: () => void }

const PRODUCTS: Array<{ value: Skill['product']; label: string }> = [
  { value: 'vpn-x402',   label: 'VPN x402' },
  { value: 'gnosis-card', label: 'Gnosis Card' },
  { value: 'vps-x402',   label: 'VPS x402' },
  { value: 'custom',     label: 'Custom' },
];

export function AddSkillDialog({ agentId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [product, setProduct] = useState<Skill['product']>('vpn-x402');
  const [cap, setCap] = useState('10');
  const [autoApprove, setAutoApprove] = useState('1');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        product,
        name,
        enabled: true,
        spendCapUsdc: parseFloat(cap),
        autoApproveUsdc: parseFloat(autoApprove),
        periodSeconds: 86400,
      }),
    });
    setLoading(false);
    setOpen(false);
    setName('');
    onCreated();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" /> Install Skill
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Install Skill</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Product</label>
                <select
                  value={product} onChange={e => setProduct(e.target.value as Skill['product'])}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Skill Name</label>
                <input
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Daily VPN Access"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Daily Cap (USDC)</label>
                  <input
                    type="number" value={cap} onChange={e => setCap(e.target.value)}
                    min="0.01" step="0.01"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Auto-approve under</label>
                  <input
                    type="number" value={autoApprove} onChange={e => setAutoApprove(e.target.value)}
                    min="0" step="0.01"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Installing…' : 'Install Skill'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
