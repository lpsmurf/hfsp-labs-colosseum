/**
 * Provisioning progress indicator with animated steps
 */
import React from 'react';
import { ProvisioningStatus } from '../types/agent';

const STEPS: { key: ProvisioningStatus; label: string }[] = [
  { key: 'pending',           label: 'Queued'     },
  { key: 'ssh_key_installed', label: 'SSH Ready'  },
  { key: 'container_started', label: 'Container'  },
  { key: 'active',            label: 'Live'       },
];

const stepIndex = (s: ProvisioningStatus) =>
  STEPS.findIndex((x) => x.key === s);

interface Props {
  status: ProvisioningStatus;
  compact?: boolean;
}

const ProvisioningBadge: React.FC<Props> = ({ status, compact }) => {
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Failed
      </span>
    );
  }

  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Live
      </span>
    );
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Provisioning…
      </span>
    );
  }

  const current = stepIndex(status);
  const pct = Math.round(((current + 1) / STEPS.length) * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1 text-gray-500 dark:text-gray-400">
        <span>Provisioning</span>
        <span>{pct}%</span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Steps */}
      <div className="flex justify-between">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex flex-col items-center gap-0.5">
            <div className={`w-3 h-3 rounded-full border-2 ${
              i < current
                ? 'bg-blue-500 border-blue-500'
                : i === current
                  ? 'bg-white border-blue-500 ring-2 ring-blue-300 animate-pulse'
                  : 'bg-white border-gray-300 dark:bg-gray-800 dark:border-gray-600'
            }`} />
            <span className={`text-xs ${i <= current ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProvisioningBadge;
