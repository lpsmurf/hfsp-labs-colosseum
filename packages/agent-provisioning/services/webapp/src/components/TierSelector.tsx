import { TIER_INFO } from '../types/deployment';

interface TierSelectorProps {
  value: 'tier_explorer' | 'tier_a' | 'tier_b';
  onChange: (tier: 'tier_explorer' | 'tier_a' | 'tier_b') => void;
  error?: string;
}

export function TierSelector({ value, onChange, error }: TierSelectorProps) {
  const tiers = ['tier_explorer', 'tier_a', 'tier_b'] as const;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
        Deployment Tier
      </label>
      <div className="space-y-2">
        {tiers.map((tier) => {
          const info = TIER_INFO[tier];
          return (
            <label
              key={tier}
              className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition ${
                value === tier
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="tier"
                value={tier}
                checked={value === tier}
                onChange={(e) => onChange(e.target.value as typeof tier)}
                className="mt-1 mr-3 w-4 h-4"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">{info.label}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{info.description}</div>
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-1">
                  {info.price}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  );
}
