import { DeploymentRequest } from '../types/deployment';
import { TIER_INFO, PAYMENT_TOKEN_INFO } from '../types/deployment';

interface DeploymentSummaryProps {
  data: Partial<DeploymentRequest>;
}

export function DeploymentSummary({ data }: DeploymentSummaryProps) {
  const tierInfo = data.tier_id ? TIER_INFO[data.tier_id] : null;
  const paymentInfo = data.payment_token ? PAYMENT_TOKEN_INFO[data.payment_token] : null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Deployment Summary</h3>
      
      {data.tier_id && (
        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">Tier:</span>
          <span className="font-medium text-gray-900 dark:text-white">{tierInfo?.label}</span>
        </div>
      )}
      
      {data.agent_name && (
        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">Agent Name:</span>
          <span className="font-medium text-gray-900 dark:text-white">{data.agent_name}</span>
        </div>
      )}
      
      {data.owner_wallet && (
        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">Wallet:</span>
          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white truncate">
            {data.owner_wallet.slice(0, 8)}...{data.owner_wallet.slice(-8)}
          </span>
        </div>
      )}
      
      {data.payment_token && (
        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">Payment Token:</span>
          <span className="font-medium text-gray-900 dark:text-white">{paymentInfo?.label}</span>
        </div>
      )}
      
      {data.payment_tx_hash && (
        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">Payment TX:</span>
          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white truncate">
            {data.payment_tx_hash.slice(0, 8)}...
          </span>
        </div>
      )}
      
      {data.llm_provider && (
        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">LLM Provider:</span>
          <span className="font-medium text-gray-900 dark:text-white capitalize">{data.llm_provider}</span>
        </div>
      )}
    </div>
  );
}
