import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformClient } from '../services/api'
import type { PlatformAgent, PlatformAgentStatus } from '../types/api'

type FilterStatus = 'all' | PlatformAgentStatus

const STATUS_LABELS: Record<PlatformAgentStatus, string> = {
  deploying: 'Deploying',
  active: 'Active',
  stopped: 'Stopped',
  failed: 'Failed',
}

const STATUS_COLORS: Record<PlatformAgentStatus, string> = {
  deploying: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  stopped: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const FILTER_PILLS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Deploying', value: 'deploying' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Failed', value: 'failed' },
]

const LLM_LABEL: Record<string, string> = {
  poly: 'Poly (managed)',
  byok: 'BYOK',
  custom: 'Custom endpoint',
}

export function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<PlatformAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [stopping, setStopping] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchAgents = useCallback(async () => {
    try {
      const list = await platformClient.getAgents()
      setAgents(list)
      setError('')
    } catch {
      setError('Failed to load agents.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 5000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  async function handleStop(id: string) {
    setStopping(id)
    try {
      await platformClient.stopAgent(id)
      setAgents((prev) => prev.map((a) => a.id === id ? { ...a, status: 'stopped' } : a))
    } catch {
      // re-fetch on error to get accurate state
      fetchAgents()
    } finally {
      setStopping(null)
    }
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const filtered = filter === 'all' ? agents : agents.filter((a) => a.status === filter)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Agents</h1>
        <button
          onClick={() => { setIsLoading(true); fetchAgents() }}
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
            <p className="text-red-500 text-sm mb-3">{error}</p>
            <button
              onClick={fetchAgents}
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
                : `No agents with status "${STATUS_LABELS[filter as PlatformAgentStatus] ?? filter}".`}
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
            {filtered.map((agent) => {
              const isExpanded = expanded === agent.id
              const isStopping = stopping === agent.id
              return (
                <div
                  key={agent.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white truncate">{agent.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {LLM_LABEL[agent.llm_provider] ?? agent.llm_provider}
                        {agent.llm_model ? ` · ${agent.llm_model}` : ''}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Created {formatDate(agent.created_at)}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[agent.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {agent.status === 'deploying' && (
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1 animate-pulse" />
                      )}
                      {STATUS_LABELS[agent.status] ?? agent.status}
                    </span>
                  </div>

                  {/* Actions row */}
                  <div className="mt-3 flex items-center gap-2">
                    {agent.status === 'active' && (
                      <button
                        onClick={() => handleStop(agent.id)}
                        disabled={isStopping}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        {isStopping ? 'Stopping…' : '⏹ Stop'}
                      </button>
                    )}
                    {(agent.mcp_port || agent.agent_port) && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : agent.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        {isExpanded ? '▲ Hide ports' : '▼ Show ports'}
                      </button>
                    )}
                  </div>

                  {/* Expanded ports */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                      {agent.mcp_port && <span>MCP port: <span className="font-mono text-gray-700 dark:text-gray-300">{agent.mcp_port}</span></span>}
                      {agent.agent_port && <span>Agent port: <span className="font-mono text-gray-700 dark:text-gray-300">{agent.agent_port}</span></span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Agents
