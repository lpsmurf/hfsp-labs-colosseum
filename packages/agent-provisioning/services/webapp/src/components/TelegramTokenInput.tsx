import { useState } from 'react';

interface TelegramTokenInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  error?: string;
}

export function TelegramTokenInput({ 
  value, 
  onChange, 
  onValidationChange,
  error 
}: TelegramTokenInputProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'success' | 'error' | null>(null);
  const [validationMessage, setValidationMessage] = useState('');

  const tokenRegex = /^\d+:[a-zA-Z0-9_-]+$/;
  const isFormatValid = tokenRegex.test(value) || value === '';

  const handleTest = async () => {
    if (!tokenRegex.test(value)) {
      setValidationStatus('error');
      setValidationMessage('Invalid Telegram token format');
      onValidationChange?.(false);
      return;
    }

    setIsValidating(true);
    try {
      // In a real app, this would call the backend to test the token
      // For now, just validate the format
      setValidationStatus('success');
      setValidationMessage('Token format is valid');
      onValidationChange?.(true);
    } catch {
      setValidationStatus('error');
      setValidationMessage('Failed to validate token');
      onValidationChange?.(false);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
        Telegram Bot Token
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setValidationStatus(null);
            setValidationMessage('');
          }}
          placeholder="123456789:ABCdefGHIjklmnoPQRstuvWXYZ"
          className={`flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none transition ${
            error || !isFormatValid
              ? 'border-red-300 dark:border-red-700 focus:border-red-500'
              : validationStatus === 'success'
              ? 'border-green-300 dark:border-green-700 focus:border-green-500'
              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
          }`}
        />
        <button
          onClick={handleTest}
          disabled={!value || isValidating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
        >
          {isValidating ? 'Testing...' : 'Test'}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Format: bot_id:bot_token
      </p>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      {validationStatus && (
        <p className={`text-sm mt-2 ${validationStatus === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
          {validationMessage}
        </p>
      )}
    </div>
  );
}
