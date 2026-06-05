'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Agent } from '@/lib/types';
import type { MarketService } from '@/lib/marketplace';
import { CATEGORIES, type Category } from '@/lib/marketplace';
import { ServiceCard } from '@/components/ServiceCard';
import { Search, Store } from 'lucide-react';

export default function MarketplacePage() {
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [agentId, setAgentId]   = useState('');
  const [services, setServices] = useState<MarketService[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery]       = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading]   = useState(true);

  // Load agents + their installed marketplace skills
  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then((a: Agent[]) => {
      setAgents(a);
      if (a[0]) setAgentId(a[0].id);
    });
  }, []);

  const reloadInstalled = useCallback((id: string) => {
    if (!id) return;
    fetch(`/api/skills?agentId=${id}`)
      .then(r => r.json())
      .then((skills: Array<{ marketServiceId?: string }>) => {
        setInstalled(new Set(skills.map(s => s.marketServiceId).filter(Boolean) as string[]));
      });
  }, []);

  useEffect(() => { reloadInstalled(agentId); }, [agentId, reloadInstalled]);

  // Debounce search query by 400ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const loadServices = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery)      params.set('q', debouncedQuery);
    if (category !== 'All')  params.set('category', category);
    fetch(`/api/marketplace?${params}`)
      .then(r => r.json())
      .then(setServices)
      .finally(() => setLoading(false));
  }, [debouncedQuery, category]);

  useEffect(() => { loadServices(); }, [loadServices]);

  async function activate(service: MarketService) {
    if (!agentId) return;
    const minPrice = service.endpoints[0]?.price ?? '0';
    const priceNum = parseFloat(minPrice.replace(/[^0-9.]/g, '')) || 0.01;

    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        product: 'marketplace',
        name: service.name,
        enabled: true,
        spendCapUsdc: Math.max(priceNum * 100, 1),
        autoApproveUsdc: priceNum,
        periodSeconds: 86400,
        marketServiceId: service.id,
        marketCategory: service.category,
      }),
    });
    setInstalled(prev => new Set([...prev, service.id]));
  }

  async function deactivate(service: MarketService) {
    if (!agentId) return;
    await fetch('/api/skills', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, marketServiceId: service.id }),
    });
    setInstalled(prev => { const s = new Set(prev); s.delete(service.id); return s; });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">x402 Marketplace</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {services.length} services · pay-per-request USDC · no API keys needed
          </p>
        </div>

        {/* Agent selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Activate for:</span>
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className="bg-card border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* Search + category filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search services…"
            className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                category === c
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 h-40 animate-pulse" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm">No services found. Try a different search or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map(s => (
            <ServiceCard
              key={s.id}
              service={s}
              installed={installed.has(s.id)}
              onActivate={() => activate(s)}
              onDeactivate={() => deactivate(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
