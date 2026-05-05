import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgents } from '../hooks/useAgents'
import { Agent, AgentStatus } from '../types/agent'

type FilterStatus = 'all' | AgentStatus

const STATUS_LABELS: Record<AgentStatus, string> = {
  active: 'Active',
  provisioning: 'Provisioning',
  awaiting_pairing: 'Awaiting Pairing',
  failed: 'Failed',
  inactive: 'Inactive',
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  provisioning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  awaiting_pairing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const FILTER_PILLS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Provisioning', value: 'provisioning' },
  { label: 'Awaiting Pairing', value: 'awaiting_pairing' },
  { label: 'Failed', value: 'failed' },
]

export function Agents() {
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useAgents()
  const [filter, setFilter] = useState<FilterStatus>('all')

  const agents: Agent[] = data?.agents ?? []
  const filtered = filter === 'all' ? agents : agents.filter((a) => a.status === filter)

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 10000)
    return () => clearInterval(interval)
  }, [refetch])

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Agents</h1>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
          title="Refresh"
        >
          🔄
        </button>
      </div>

      {/* Filter pills */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill.value}
            onClick={() => setFilter(pill.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === pill.value
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-4">
        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="text-center py-10">
            <p className="text-red-500 text-sm mb-3">Failed to load agents.</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <p className="text-4xl">🤖</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {filter === 'all'
                ? 'No agents yet. Deploy your first one!'
                : `No agents with status "${filter}".`}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => navigate('/deploy')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-colors"
              >
                🚀 Deploy First Agent
              </button>
            )}
          </div>
        )}

        {/* Agent cards */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="space-y-3 mt-1">
            {filtered.map((agent) => (
              <div
                key={agent.id}
                className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-white truncate">{agent.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {agent.provider} · {agent.model}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Created {formatDate(agent.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[agent.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {STATUS_LABELS[agent.status] ?? agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Agents
