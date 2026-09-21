import { PAYMENT_TOKEN_INFO } from '../types/deployment';

interface PaymentMethodSelectorProps {
  value: 'SOL' | 'USDT' | 'USDC' | 'HERD';
  onChange: (token: 'SOL' | 'USDT' | 'USDC' | 'HERD') => void;
  error?: string;
}

export function PaymentMethodSelector({ value, onChange, error }: PaymentMethodSelectorProps) {
  const tokens = ['SOL', 'USDT', 'USDC', 'HERD'] as const;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
        Payment Token
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as typeof value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
      >
        {tokens.map((token) => {
          const info = PAYMENT_TOKEN_INFO[token];
          return (
            <option key={token} value={token}>
              {info.label} ({info.symbol})
            </option>
          );
        })}
      </select>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  );
}
