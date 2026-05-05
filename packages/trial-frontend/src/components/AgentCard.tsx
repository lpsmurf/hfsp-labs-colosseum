/**
 * Agent Card — dashboard tile with status, provisioning progress, quick actions
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Agent } from '../types/agent';
import { Button } from './shared';
import ProvisioningBadge from './ProvisioningBadge';

interface Props {
  agent: Agent;
  onDelete?: (id: string) => void;
}

const statusDot: Record<string, string> = {
  active:   'bg-green-500',
  inactive: 'bg-gray-400',
  paused:   'bg-yellow-400',
  error:    'bg-red-500',
};

function timeAgo(iso?: string): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const AgentCard: React.FC<Props> = ({ agent, onDelete }) => {
  const navigate = useNavigate();
  const dot = statusDot[agent.status] ?? 'bg-gray-400';
  const isProvisioning = agent.provisioning_status !== 'active' && agent.provisioning_status !== 'failed';

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${dot} ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{agent.name}</h3>
        </div>
        <span className="flex-shrink-0 ml-2 text-xs text-gray-400 dark:text-gray-500">
          {timeAgo(agent.last_heartbeat)}
        </span>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{agent.description}</p>
      )}

      {/* Model + temperature chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {agent.config.model && (
          <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 font-mono">
            {agent.config.model}
          </span>
        )}
        {agent.config.temperature !== undefined && (
          <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300">
            temp {agent.config.temperature.toFixed(1)}
          </span>
        )}
      </div>

      {/* Provisioning progress or live badge */}
      <div className="mb-4">
        {isProvisioning
          ? <ProvisioningBadge status={agent.provisioning_status} />
          : <ProvisioningBadge status={agent.provisioning_status} compact />
        }
      </div>

      {/* API key preview */}
      <div className="mb-4 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 font-mono text-xs text-gray-500 dark:text-gray-400 truncate">
        {agent.api_key.slice(0, 10)}••••••••{agent.api_key.slice(-6)}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => navigate(`/agent/${agent.id}`)}
        >
          View
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={() => navigate(`/agent/${agent.id}/edit`)}
        >
          Edit
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDelete?.(agent.id)}
        >
          ✕
        </Button>
      </div>
    </div>
  );
};

export default AgentCard;
