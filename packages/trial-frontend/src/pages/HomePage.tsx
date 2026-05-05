/**
 * Dashboard — agent list
 */
import { useNavigate } from 'react-router-dom';
import { useAgents, useDeleteAgent } from '../hooks/useAgents';
import { useToast } from '../components/shared';
import { Button } from '../components/shared';
import useTelegramApp from '../hooks/useTelegramApp';
import { Agent } from '../types/agent';

const STATUS_COLOR: Record<string, string> = {
  active:          'bg-green-500',
  awaiting_pairing: 'bg-yellow-400',
  provisioning:    'bg-blue-400',
  failed:          'bg-red-500',
  inactive:        'bg-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  active:          'Active',
  awaiting_pairing: 'Awaiting pairing',
  provisioning:    'Provisioning…',
  failed:          'Failed',
  inactive:        'Inactive',
};

function AgentCard({ agent }: { agent: Agent }) {
  const tg = useTelegramApp();
  const toast = useToast();
  const { mutateAsync, isLoading } = useDeleteAgent(agent.id);
  const dot = STATUS_COLOR[agent.status] ?? 'bg-gray-400';

  const handleDelete = async () => {
    const ok = await tg.showConfirm(`Delete "${agent.name}"? This cannot be undone.`);
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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${dot} ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{agent.name}</h3>
        </div>
        <span className={`flex-shrink-0 ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
          agent.status === 'active'           ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
          agent.status === 'awaiting_pairing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
          agent.status === 'provisioning'     ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
          agent.status === 'failed'           ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
          'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        }`}>
          {STATUS_LABEL[agent.status] ?? agent.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 capitalize">
          {agent.provider}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 font-mono">
          {agent.model}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {new Date(agent.createdAt).toLocaleDateString()}
        </span>
      </div>

      {agent.status === 'awaiting_pairing' && (
        <div className="mb-3 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
          Send <code>/start</code> to your bot and enter the pairing code at <strong>app.hfsp.cloud</strong>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="danger" size="sm" isLoading={isLoading} onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const tg = useTelegramApp();
  const { data, isLoading, error, refetch } = useAgents();

  const agents = data?.agents ?? [];
  const stats = {
    total:        agents.length,
    active:       agents.filter(a => a.status === 'active').length,
    provisioning: agents.filter(a => a.status === 'provisioning' || a.status === 'awaiting_pairing').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 pt-8 pb-16">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Agents</h1>
            <p className="text-blue-100 text-sm mt-0.5">Manage your AI fleet</p>
          </div>
          <button onClick={() => refetch()} className="text-blue-200 hover:text-white text-sm">↻</button>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-4xl mx-auto px-6 -mt-10 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total',        value: stats.total,        color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Active',       value: stats.active,       color: 'text-green-600 dark:text-green-400' },
            { label: 'In progress',  value: stats.provisioning, color: 'text-yellow-600 dark:text-yellow-400' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-red-700 dark:text-red-300 mb-4 text-sm">
            Failed to load agents.{' '}
            <button onClick={() => refetch()} className="underline">Try again</button>
          </div>
        )}

        {!isLoading && agents.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-lg font-semibold mb-2">No agents yet</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Create your first AI agent to get started</p>
            <Button variant="primary" onClick={() => navigate('/setup')}>Create Agent</Button>
          </div>
        )}

        <div className="grid gap-4">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* FAB */}
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
