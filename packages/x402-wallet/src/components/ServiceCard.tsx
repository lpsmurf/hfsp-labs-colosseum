'use client';

import type { MarketService } from '@/lib/marketplace';
import { CheckCircle, Plus, Zap, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const CATEGORY_COLORS: Record<string, string> = {
  Inference:      'text-violet-400 bg-violet-500/10 border-violet-500/20',
  Data:           'text-blue-400 bg-blue-500/10 border-blue-500/20',
  Search:         'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  Media:          'text-pink-400 bg-pink-500/10 border-pink-500/20',
  Social:         'text-orange-400 bg-orange-500/10 border-orange-500/20',
  Trading:        'text-green-400 bg-green-500/10 border-green-500/20',
  Infrastructure: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

interface Props {
  service: MarketService;
  installed: boolean;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
}

export function ServiceCard({ service, installed, onActivate, onDeactivate }: Props) {
  const [loading, setLoading] = useState(false);
  const catColor = CATEGORY_COLORS[service.category] ?? 'text-muted-foreground bg-secondary border-border';

  const minPrice = service.endpoints.reduce((min, ep) => {
    const num = parseFloat(ep.price.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? min : Math.min(min, num);
  }, Infinity);

  async function toggle() {
    setLoading(true);
    installed ? await onDeactivate() : await onActivate();
    setLoading(false);
  }

  const networks = [...new Set(service.endpoints.flatMap(e => e.networks ?? []))];

  return (
    <div className={`bg-card border rounded-lg p-4 flex flex-col gap-3 transition-colors ${
      installed ? 'border-primary/40' : 'border-border hover:border-border/80'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">{service.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${catColor}`}>
              {service.category}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
        </div>
      </div>

      {/* Endpoints preview */}
      <div className="space-y-1">
        {service.endpoints.slice(0, 2).map((ep, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono truncate max-w-[160px]">{ep.name}</span>
            <span className="text-primary font-medium shrink-0 ml-2">{ep.price}</span>
          </div>
        ))}
        {service.endpoints.length > 2 && (
          <p className="text-xs text-muted-foreground">+{service.endpoints.length - 2} more endpoints</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 mt-auto border-t border-border">
        <div className="flex items-center gap-1.5">
          {networks.slice(0, 2).map(n => (
            <span key={n} className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">{n}</span>
          ))}
          {isFinite(minPrice) && (
            <span className="text-[10px] text-muted-foreground">from ${minPrice} USDC</span>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
            installed
              ? 'bg-primary/10 text-primary border border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {loading ? (
            <Zap className="h-3 w-3 animate-pulse" />
          ) : installed ? (
            <><CheckCircle className="h-3 w-3" /> Activated</>
          ) : (
            <><Plus className="h-3 w-3" /> Activate</>
          )}
        </button>
      </div>
    </div>
  );
}
