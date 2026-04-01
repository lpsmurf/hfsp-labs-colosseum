/**
 * Dashboard — agent list with search, filter, sort, delete
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgents, useDeleteAgent } from '../hooks/useAgents';
import { useToast } from '../components/shared';
import { Button, Input } from '../components/shared';
import AgentCard from '../components/AgentCard';
import useTelegramApp from '../hooks/useTelegramApp';

type SortKey = 'name' | 'created_at' | 'status';
type StatusFilter = 'all' | 'active' | 'inactive' | 'paused' | 'error';

function DeleteButton({ agentId }: { agentId: string }) {
  const { mutateAsync, isLoading } = useDeleteAgent(agentId);
  const toast = useToast();
  const tg = useTelegramApp();

  const handleDelete = async () => {
    const ok = await tg.showConfirm('Delete this agent? This cannot be undone.');
    if (!ok) return;
    try {
      await mutateAsync();
      toast.success('Agent deleted');
      tg.haptic('notificationOccurred', 'success');
    } catch {
      toast.error('Failed to delete agent');
    }
  };

  return (
    <Button variant="danger" size="sm" isLoading={isLoading} onClick={handleDelete}>
      ✕
    </Button>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const tg = useTelegramApp();
  const { data, isLoading, error } = useAgents(1, 50);
  const toast = useToast();

  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState<StatusFilter>('all');
  const [sort, setSort]       = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  const agents = data?.agents ?? [];

  const filtered = useMemo(() => {
    let list = agents;
    if (status !== 'all') list = list.filter((a) => a.status === status);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.config.model?.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort === 'name')       cmp = a.name.localeCompare(b.name);
      if (sort === 'status')     cmp = a.status.localeCompare(b.status);
      if (sort === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [agents, search, status, sort, sortAsc]);

  const handleDelete = async (id: string) => {
    const ok = await tg.showConfirm('Delete this agent? This cannot be undone.');
    if (!ok) return;
  };

  const stats = {
    total:       agents.length,
    active:      agents.filter((a) => a.status === 'active').length,
    provisioning: agents.filter((a) => a.provisioning_status !== 'active' && a.provisioning_status !== 'failed').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 pt-8 pb-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">My Agents</h1>
          <p className="text-blue-100 text-sm">Manage and monitor your AI fleet</p>
        </div>
      </div>

      {/* Stats cards — overlap the header */}
      <div className="max-w-4xl mx-auto px-6 -mt-10 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total',        value: stats.total,        color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Active',       value: stats.active,       color: 'text-green-600 dark:text-green-400' },
            { label: 'Provisioning', value: stats.provisioning, color: 'text-yellow-600 dark:text-yellow-400' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search + filter + sort */}
      <div className="max-w-4xl mx-auto px-6 mb-4 space-y-3">
        <Input
          placeholder="Search by name, description or model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'active', 'inactive', 'paused', 'error'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                status === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {f}
            </button>
          ))}

          <div className="ml-auto flex-shrink-0 flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="text-xs bg-transparent text-gray-600 dark:text-gray-300 outline-none"
            >
              <option value="created_at">Date</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
            <button
              onClick={() => setSortAsc((v) => !v)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            >
              {sortAsc ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 pb-32">
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-red-700 dark:text-red-300 mb-4">
            Failed to load agents. Please try again.
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-lg font-semibold mb-2">
              {search || status !== 'all' ? 'No agents match your filters' : 'No agents yet'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              {search || status !== 'all'
                ? 'Try clearing your search or changing the filter'
                : 'Create your first AI agent to get started'}
            </p>
            {!search && status === 'all' && (
              <Button variant="primary" onClick={() => navigate('/setup')}>
                Create Agent
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-4">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
          ))}
        </div>
      </div>

      {/* Sticky FAB */}
      <div className="fixed bottom-6 right-6">
        <Button
          variant="primary"
          size="lg"
          onClick={() => { tg.haptic('impactOccurred', 'light'); navigate('/setup'); }}
          className="rounded-full shadow-xl px-6"
        >
          + New Agent
        </Button>
      </div>
    </div>
  );
}

export default HomePage;
