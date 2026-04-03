/**
 * Create Agent — minimal form matching the live backend contract
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAgent } from '../hooks/useAgents';
import { useToast } from '../components/shared';
import { Button } from '../components/shared';
import useTelegramApp from '../hooks/useTelegramApp';

type Provider = 'anthropic' | 'openai' | 'openrouter';

const PROVIDERS: { id: Provider; label: string; placeholder: string; hint: string }[] = [
  { id: 'anthropic',   label: 'Anthropic',   placeholder: 'sk-ant-...',  hint: 'Claude models' },
  { id: 'openai',      label: 'OpenAI',      placeholder: 'sk-...',      hint: 'GPT models' },
  { id: 'openrouter',  label: 'OpenRouter',  placeholder: 'sk-or-...',   hint: '200+ models' },
];

const MODELS: Record<Provider, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude 3.5 Sonnet',  value: 'claude-3-5-sonnet-20241022' },
    { label: 'Claude 3 Opus',      value: 'claude-3-opus-20240229' },
    { label: 'Claude 3 Sonnet',    value: 'claude-3-sonnet-20240229' },
  ],
  openai: [
    { label: 'GPT-4o',             value: 'gpt-4o' },
    { label: 'GPT-4 Turbo',        value: 'gpt-4-turbo' },
    { label: 'GPT-3.5 Turbo',      value: 'gpt-3.5-turbo' },
  ],
  openrouter: [
    { label: 'Auto (best available)', value: 'openrouter/auto' },
    { label: 'GPT-4o',               value: 'openai/gpt-4o' },
    { label: 'Claude 3.5 Sonnet',    value: 'anthropic/claude-3.5-sonnet' },
    { label: 'Llama 3.1 405B',       value: 'meta-llama/llama-3.1-405b-instruct' },
    { label: 'Gemini Pro 1.5',       value: 'google/gemini-pro-1.5' },
  ],
};

export function SetupPage() {
  const tg      = useTelegramApp();
  const toast   = useToast();
  const navigate = useNavigate();
  const createAgentMutation = useCreateAgent();

  const [name,      setName]      = useState('');
  const [provider,  setProvider]  = useState<Provider>('anthropic');
  const [model,     setModel]     = useState(MODELS.anthropic[0].value);
  const [botToken,  setBotToken]  = useState('');
  const [apiKey,    setApiKey]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setModel(MODELS[p][0].value);
    setApiKey('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !botToken.trim() || !apiKey.trim()) return;

    setSubmitting(true);
    tg.haptic('impactOccurred', 'medium');

    try {
      await createAgentMutation.mutateAsync({
        name: name.trim(),
        provider,
        model,
        botToken: botToken.trim(),
        anthropicApiKey:  provider === 'anthropic'  ? apiKey.trim() : undefined,
        openaiApiKey:     provider === 'openai'     ? apiKey.trim() : undefined,
        openrouterApiKey: provider === 'openrouter' ? apiKey.trim() : undefined,
      });

      toast.success('Agent provisioning started!');
      tg.haptic('notificationOccurred', 'success');
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to create agent';
      toast.error(msg);
      tg.haptic('notificationOccurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const currentProvider = PROVIDERS.find(p => p.id === provider)!;
  const isLoading = submitting || createAgentMutation.isLoading;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 pt-8 pb-6">
        <button onClick={() => navigate('/')} className="text-blue-200 hover:text-white text-sm mb-4 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold">New Agent</h1>
        <p className="text-blue-100 text-sm mt-1">Connect a Telegram bot to an AI model</p>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Agent Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Agent Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Customer Support Bot"
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium mb-1.5">LLM Provider <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    provider === p.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300'
                  }`}
                >
                  <div>{p.label}</div>
                  <div className={`text-xs mt-0.5 ${provider === p.id ? 'text-blue-100' : 'text-gray-400'}`}>{p.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Model <span className="text-red-500">*</span></label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 transition-colors"
            >
              {MODELS[provider].map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Telegram Bot Token */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Telegram Bot Token <span className="text-red-500">*</span></label>
            <input
              type="password"
              required
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="Get from @BotFather"
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Create a new bot with @BotFather on Telegram, then paste the token here
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {currentProvider.label} API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={currentProvider.placeholder}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Your key is stored securely — you pay the provider directly
            </p>
          </div>

          {/* Error */}
          {createAgentMutation.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm">
              {(createAgentMutation.error as any)?.response?.data?.error ?? 'Failed to create agent'}
            </div>
          )}

          {/* Submit */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 pt-4 pb-6 -mx-6 px-6 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
              disabled={isLoading || !name.trim() || !botToken.trim() || !apiKey.trim()}
            >
              {isLoading ? 'Provisioning…' : 'Create & Provision Agent'}
            </Button>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2">
              Your bot will be ready in about 60 seconds
            </p>
          </div>

        </form>
      </div>
    </div>
  );
}

export default SetupPage;
