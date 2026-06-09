'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface Props { onCreated: () => void }

export function AddAgentDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [wallet, setWallet] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, walletAddress: wallet, description: desc }),
    });
    setLoading(false);
    if (!res.ok) { setError('Failed to create agent'); return; }
    setOpen(false);
    setName(''); setWallet(''); setDesc('');
    onCreated();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" /> Add Agent
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Add Agent</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Agent Name</label>
                <input
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="Poly Agent #1"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Solana Wallet Address</label>
                <input
                  value={wallet} onChange={e => setWallet(e.target.value)}
                  placeholder="HQpzmjqd9CDp3a9..."
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
                <input
                  value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="Autonomous DeFi agent for..."
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Adding…' : 'Add Agent'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
