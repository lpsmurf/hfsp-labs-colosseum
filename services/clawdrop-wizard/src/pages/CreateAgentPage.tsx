import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { agentAPI } from '../services/api';

const MODELS: Record<string, { label: string; value: string }[]> = {
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
    { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
  ],
  anthropic: [
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
    { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
    { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229' },
  ],
  openrouter: [
    { label: 'Auto (best available)', value: 'openrouter/auto' },
    { label: 'GPT-4o (via OpenRouter)', value: 'openai/gpt-4o' },
    { label: 'Claude 3.5 Sonnet (via OpenRouter)', value: 'anthropic/claude-3.5-sonnet' },
    { label: 'Llama 3.1 405B (via OpenRouter)', value: 'meta-llama/llama-3.1-405b-instruct' },
    { label: 'Gemini Pro 1.5 (via OpenRouter)', value: 'google/gemini-pro-1.5' },
  ],
};

export default function CreateAgentPage() {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState(MODELS.anthropic[0].value);
  const [botToken, setBotToken] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleProviderChange = (p: string) => {
    setProvider(p);
    setModel(MODELS[p][0].value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await agentAPI.createAgent({
        name,
        provider,
        model,
        botToken,
        openaiApiKey: provider === 'openai' ? openaiApiKey : undefined,
        anthropicApiKey: provider === 'anthropic' ? anthropicApiKey : undefined,
        openrouterApiKey: provider === 'openrouter' ? openrouterApiKey : undefined,
      });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back</Link>

        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold mb-6">Create New Agent</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My Awesome Agent" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">LLM Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {(['anthropic', 'openai', 'openrouter'] as const).map(p => (
                  <button key={p} type="button"
                    onClick={() => handleProviderChange(p)}
                    className={`py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                      provider === p
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}>
                    {p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'OpenRouter'}
                  </button>
                ))}
              </div>
              {provider === 'openrouter' && (
                <p className="text-xs text-gray-500 mt-1">Access 200+ models with one key via openrouter.ai</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MODELS[provider].map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Bot Token</label>
              <input type="password" required value={botToken} onChange={e => setBotToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Get from @BotFather on Telegram" />
              <p className="text-xs text-gray-500 mt-1">Create a bot via @BotFather and paste the token here</p>
            </div>

            {provider === 'anthropic' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anthropic API Key</label>
                <input type="password" required value={anthropicApiKey} onChange={e => setAnthropicApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-ant-..." />
                <p className="text-xs text-gray-500 mt-1">Your key — you pay Anthropic directly</p>
              </div>
            )}

            {provider === 'openai' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                <input type="password" required value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-..." />
                <p className="text-xs text-gray-500 mt-1">Your key — you pay OpenAI directly</p>
              </div>
            )}

            {provider === 'openrouter' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OpenRouter API Key</label>
                <input type="password" required value={openrouterApiKey} onChange={e => setOpenrouterApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-or-..." />
                <p className="text-xs text-gray-500 mt-1">Get your key at openrouter.ai — access 200+ models</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 mt-6">
              {loading ? 'Provisioning...' : 'Create & Provision Agent'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
