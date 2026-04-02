import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { agentAPI } from '../services/api';

export default function CreateAgentPage() {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4');
  const [botToken, setBotToken] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My Awesome Agent" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">LLM Provider</label>
              <select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(e.target.value === 'openai' ? 'gpt-4' : 'claude-3-sonnet'); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                {provider === 'openai' ? (
                  <><option value="gpt-4">GPT-4</option><option value="gpt-3.5-turbo">GPT-3.5 Turbo</option></>
                ) : (
                  <><option value="claude-3-opus">Claude 3 Opus</option><option value="claude-3-sonnet">Claude 3 Sonnet</option></>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Bot Token</label>
              <input type="password" required value={botToken} onChange={(e) => setBotToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Get from @BotFather on Telegram" />
              <p className="text-xs text-gray-500 mt-1">Create a bot via @BotFather and paste the token here</p>
            </div>

            {provider === 'openai' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                <input type="password" required value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-..." />
                <p className="text-xs text-gray-500 mt-1">Your own OpenAI key — you pay OpenAI directly</p>
              </div>
            )}

            {provider === 'anthropic' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anthropic API Key</label>
                <input type="password" required value={anthropicApiKey} onChange={(e) => setAnthropicApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-ant-..." />
                <p className="text-xs text-gray-500 mt-1">Your own Anthropic key — you pay Anthropic directly</p>
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
