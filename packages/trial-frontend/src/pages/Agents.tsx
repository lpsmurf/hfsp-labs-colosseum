import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { platformClient } from '../services/api';
import type { PlatformAgent } from '../types/api';
import { QuickDeployModal } from '../components/QuickDeployModal';

function truncate(addr: string, n = 4) {
  return addr.length > n * 2 + 3 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; dot: string; label: string }> = {
    active:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   dot: '#22c55e', label: 'Active' },
    deploying: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  dot: '#f59e0b', label: 'Deploying' },
    stopped:   { color: '#c7c4d8', bg: 'rgba(199,196,216,0.08)', dot: '#c7c4d8', label: 'Stopped' },
    failed:    { color: '#ffb4ab', bg: 'rgba(255,180,171,0.12)', dot: '#ffb4ab', label: 'Failed' },
  };
  const s = map[status] ?? map.stopped;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
          style={{ background: s.bg, color: s.color, fontFamily: "'JetBrains Mono',monospace", border: `1px solid ${s.color}30` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function AgentCard({ agent, onStop, onDelete }: { agent: PlatformAgent; onStop(): void; onDelete(): void }) {
  return (
    <div className="glass-card rounded-[24px] p-6 flex flex-col gap-5 relative overflow-hidden group">
      {/* Subtle glow on hover */}
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
           style={{ background: 'rgba(196,192,255,0.06)', filter: 'blur(32px)' }} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[16px] font-bold" style={{ color: '#e4e1ee' }}>{agent.name}</h3>
          <div className="text-[11px] mt-0.5" style={{ color: 'rgba(199,196,216,0.5)', fontFamily: "'JetBrains Mono',monospace" }}>
            {truncate(agent.id, 6)}
          </div>
        </div>
        <StatusPill status={agent.status} />
      </div>

      {/* Stats */}
      <div className="space-y-3">
        {/* Token usage */}
        <div>
          <div className="flex justify-between text-[11px] mb-1.5" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>
            <span>Token usage</span>
            <span style={{ color: '#c4c0ff' }}>
              {((agent.token_usage?.input_tokens ?? 0) + (agent.token_usage?.output_tokens ?? 0)).toLocaleString()} / {agent.tier === 'free_trial' ? '100K' : '1M'}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all"
                 style={{
                   width: `${Math.min(100, ((agent.token_usage?.input_tokens ?? 0) + (agent.token_usage?.output_tokens ?? 0)) / (agent.tier === 'free_trial' ? 100_000 : 1_000_000) * 100)}%`,
                   background: 'linear-gradient(90deg, #c4c0ff, #a2e7ff)',
                 }} />
          </div>
        </div>

        {/* LLM + last active */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card rounded-[12px] p-3">
            <div className="text-[10px] mb-1" style={{ color: 'rgba(199,196,216,0.4)', fontFamily: "'JetBrains Mono',monospace" }}>LLM</div>
            <div className="text-[12px]" style={{ color: '#c4c0ff', fontFamily: "'JetBrains Mono',monospace" }}>
              {agent.llm_provider === 'poly' ? 'Poly' : agent.llm_provider}
            </div>
          </div>
          <div className="glass-card rounded-[12px] p-3">
            <div className="text-[10px] mb-1" style={{ color: 'rgba(199,196,216,0.4)', fontFamily: "'JetBrains Mono',monospace" }}>DEPLOYED</div>
            <div className="text-[12px]" style={{ color: '#c7c4d8', fontFamily: "'JetBrains Mono',monospace" }}>
              {agent.created_at ? timeAgo(agent.created_at) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {agent.status === 'active' ? (
          <button onClick={onStop}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7c4d8', fontFamily: "'JetBrains Mono',monospace" }}>
            <span className="ms text-[14px]">pause</span> Pause
          </button>
        ) : (
          <div className="flex-1" />
        )}
        <button onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] transition-colors hover:bg-red-500/10"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,180,171,0.7)', fontFamily: "'JetBrains Mono',monospace" }}>
          <span className="ms text-[14px]">delete</span> Delete
        </button>
      </div>
    </div>
  );
}

export function Agents() {
  const qc = useQueryClient();
  const [deployOpen, setDeployOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PlatformAgent[], Error>(
    'platformAgents',
    () => platformClient.getAgents(),
    { refetchInterval: 10_000 }
  );

  const stopMutation = useMutation(
    (id: string) => platformClient.stopAgent(id),
    { onSuccess: () => qc.invalidateQueries('platformAgents') }
  );

  const deleteMutation = useMutation(
    (id: string) => platformClient.stopAgent(id),
    { onSuccess: () => { setDeletingId(null); qc.invalidateQueries('platformAgents'); } }
  );

  const agents: PlatformAgent[] = data ?? [];

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#13121b' }}>
      {/* Nebula */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full opacity-30"
             style={{ background: '#c4c0ff20', filter: 'blur(100px)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full opacity-30"
             style={{ background: '#a2e7ff15', filter: 'blur(100px)' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {/* Page header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-[40px] font-bold" style={{ color: '#e4e1ee', letterSpacing: '-1.5px' }}>My Agents</h1>
            <p className="text-[16px] mt-1" style={{ color: '#c7c4d8' }}>
              {agents.length} agent{agents.length !== 1 ? 's' : ''} deployed
            </p>
          </div>
          <button onClick={() => setDeployOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-[14px] hover:opacity-90 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#c4c0ff,#4f44e2)', color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>
            <span className="ms text-[20px]">add</span>
            Deploy Agent
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border-2 border-t-primary mx-auto mb-4 animate-spin-slow"
                   style={{ borderColor: 'rgba(196,192,255,0.2)', borderTopColor: '#c4c0ff' }} />
              <p className="text-[14px]" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>Loading agents…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="glass-card rounded-[20px] p-6 text-center">
            <span className="ms text-[40px] mb-3 block" style={{ color: '#ffb4ab' }}>error</span>
            <p className="text-[16px]" style={{ color: '#ffb4ab' }}>Failed to load agents</p>
            <p className="text-[13px] mt-1" style={{ color: 'rgba(199,196,216,0.5)', fontFamily: "'JetBrains Mono',monospace" }}>
              {String(error instanceof Error ? error.message : 'Unknown error')}
            </p>
          </div>
        )}

        {/* Grid */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onStop={() => stopMutation.mutate(agent.id)}
                onDelete={() => setDeletingId(agent.id)}
              />
            ))}

            {/* Empty slot / CTA */}
            <button onClick={() => setDeployOpen(true)}
                    className="rounded-[24px] flex flex-col items-center justify-center gap-3 py-16 transition-colors hover:bg-white/5"
                    style={{ border: '2px dashed rgba(255,255,255,0.12)', color: 'rgba(199,196,216,0.4)' }}>
              <span className="ms text-[40px]" style={{ color: 'rgba(196,192,255,0.4)' }}>add_circle</span>
              <span className="text-[14px]" style={{ fontFamily: "'JetBrains Mono',monospace" }}>Deploy your {agents.length > 0 ? 'next' : 'first'} agent</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,7,15,0.8)', backdropFilter: 'blur(12px)' }}>
          <div className="glass-card rounded-[24px] p-8 max-w-sm w-full text-center">
            <span className="ms text-[48px] mb-4 block" style={{ color: '#ffb4ab' }}>warning</span>
            <h3 className="text-[20px] font-bold mb-2" style={{ color: '#e4e1ee' }}>Delete this agent?</h3>
            <p className="text-[14px] mb-6" style={{ color: '#c7c4d8' }}>
              The container and all associated data will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)}
                      className="flex-1 py-3 rounded-full text-[13px]"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7c4d8', fontFamily: "'JetBrains Mono',monospace" }}>
                Cancel
              </button>
              <button onClick={() => deleteMutation.mutate(deletingId)}
                      disabled={deleteMutation.isLoading}
                      className="flex-1 py-3 rounded-full font-bold text-[13px] hover:opacity-90"
                      style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>
                {deleteMutation.isLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickDeployModal open={deployOpen} onClose={() => { setDeployOpen(false); qc.invalidateQueries('platformAgents'); }} />
    </div>
  );
}
