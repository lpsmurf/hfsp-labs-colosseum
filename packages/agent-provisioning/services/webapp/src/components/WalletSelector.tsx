import { useState } from 'react';

interface WalletSelectorProps {
  value: string;
  onChange: (address: string) => void;
  error?: string;
}

export function WalletSelector({ value, onChange, error }: WalletSelectorProps) {
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  const connectPhantom = async () => {
    setConnectionError('');
    const phantom = (window as any).solana;
    
    if (!phantom?.isPhantom) {
      setConnectionError('Phantom wallet not found. Install it at phantom.app');
      window.open('https://phantom.app', '_blank');
      return;
    }

    setConnecting(true);
    try {
      const response = await phantom.connect();
      const walletAddress = response.publicKey.toString();
      onChange(walletAddress);
    } catch (err: any) {
      if (err.code === 4001) {
        setConnectionError('Connection rejected in Phantom');
      } else {
        setConnectionError('Failed to connect wallet');
      }
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
        Wallet Address
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste wallet address or click 'Connect Phantom'"
          readOnly={!!value}
          className={`flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none font-mono text-sm transition ${
            error || connectionError
              ? 'border-red-300 dark:border-red-700'
              : value
              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
          >
            Clear
          </button>
        )}
        {!value && (
          <button
            onClick={connectPhantom}
            disabled={connecting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition flex items-center gap-2"
          >
            {connecting ? 'Connecting...' : 'Phantom'}
          </button>
        )}
      </div>
      {(error || connectionError) && (
        <p className="text-sm text-red-500 mt-2">{error || connectionError}</p>
      )}
    </div>
  );
}
