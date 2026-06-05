'use client';

import type { Skill } from '@/lib/types';
import { formatUsdc, productLabel } from '@/lib/utils';
import { useState } from 'react';

interface Props { skill: Skill; onToggle?: () => void }

export function SkillRow({ skill, onToggle }: Props) {
  const [enabled, setEnabled] = useState(!!skill.enabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch('/api/skills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: skill.id, enabled: !enabled }),
    });
    setEnabled(e => !e);
    setLoading(false);
    onToggle?.();
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{skill.name}</p>
          <span className="text-xs text-muted-foreground shrink-0">{productLabel(skill.product)}</span>
        </div>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          <span>Cap: {formatUsdc(skill.spendCapUsdc)}/day</span>
          <span>Auto: {formatUsdc(skill.autoApproveUsdc)}</span>
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          enabled ? 'bg-primary' : 'bg-secondary'
        } ${loading ? 'opacity-50' : ''}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
