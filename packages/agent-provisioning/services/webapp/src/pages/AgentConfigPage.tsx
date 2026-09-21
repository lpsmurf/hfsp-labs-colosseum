import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard, LLMProvider } from '../context/WizardContext';
import Input from '../components/shared/Input';

const LLM_PROVIDERS: { id: LLMProvider; label: string; icon: string }[] = [
  { id: 'anthropic', label: 'Anthropic', icon: '🔵' },
  { id: 'openai', label: 'OpenAI', icon: '🟢' },
  { id: 'openrouter', label: 'OpenRouter', icon: '🟣' },
  { id: 'kimi', label: 'Kimi (Moonshot)', icon: '🌙' },
];

const MODELS: Record<LLMProvider, { value: string; label: string }[]> = {
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — Fast & affordable' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Balanced' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 — Most capable' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini — Fast & affordable' },
    { value: 'gpt-4o', label: 'GPT-4o — Balanced' },
    { value: 'o1-mini', label: 'o1-mini — Reasoning' },
  ],
  openrouter: [
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B — Free tier available' },
    { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
    { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'custom', label: 'Enter custom model ID...' },
  ],
  kimi: [
    { value: 'kimi-k2.5', label: 'Kimi K2.5 — Latest (recommended)' },
    { value: 'kimi-k2-turbo', label: 'Kimi K2 Turbo — Fast' },
    { value: 'kimi-k2-thinking', label: 'Kimi K2 Thinking — Reasoning' },
  ],
};

const API_KEY_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic API Key (sk-ant-...)',
  openai: 'OpenAI API Key (sk-proj-...)',
  openrouter: 'OpenRouter API Key (sk-or-...)',
  kimi: 'Moonshot API Key',
};

export function AgentConfigPage() {
  const navigate = useNavigate();
  const { state, set, setMany } = useWizard();
  const [customModel, setCustomModel] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const models = MODELS[state.llm_provider];
  const showCustomModel = state.llm_provider === 'openrouter' && state.llm_model === 'custom';

  const validate = () => {
    const e: Record<string, string> = {};
    if (!state.agent_name.trim() || state.agent_name.length < 3)
      e.agent_name = 'Agent name must be at least 3 characters.';
    if (state.agent_name.length > 64)
      e.agent_name = 'Agent name must be under 64 characters.';
    if (!/^\d+:[a-zA-Z0-9_-]+$/.test(state.telegram_token))
      e.telegram_token = 'Invalid format. Should look like: 123456789:ABCdef...';
    if (!state.llm_api_key.trim())
      e.llm_api_key = 'API key is required.';
    if (showCustomModel && !customModel.trim())
      e.llm_model = 'Enter a model ID.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    if (showCustomModel) set('llm_model', customModel);
    navigate('/payment');
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setMany({
      llm_provider: provider,
      llm_model: MODELS[provider][0].value,
    });
  };

  return (
    <WizardLayout
      currentStep={3}
      title="Configure your agent"
      subtitle="This is the brain and identity of your AI agent."
    >
      <div className="space-y-6">
        {/* Agent name */}
        <Input
          label="Agent Name"
          value={state.agent_name}
          onChange={e => set('agent_name', e.target.value)}
          placeholder="e.g. My Solana Scout"
          error={errors.agent_name}
          maxLength={64}
        />

        {/* Telegram Token */}
        <div>
          <Input
            label="Telegram Bot Token"
            value={state.telegram_token}
            onChange={e => set('telegram_token', e.target.value)}
            placeholder="123456789:ABCdefGHIjklmnoPQRstuvWXYZ"
            error={errors.telegram_token}
          />
          <div className="mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-400">How to get your bot token:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Open Telegram → search <span className="text-gray-300">@BotFather</span></li>
              <li>Send <span className="font-mono text-gray-300">/newbot</span> and follow prompts</li>
              <li>Copy the token it gives you (format above)</li>
            </ol>
          </div>
        </div>

        {/* LLM Provider */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">LLM Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {LLM_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  state.llm_provider === p.id
                    ? 'bg-violet-600/15 border-violet-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Select */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">Model</label>
          <select
            value={state.llm_model}
            onChange={e => set('llm_model', e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:border-violet-500"
          >
            {models.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {errors.llm_model && (
            <p className="mt-1 text-sm text-red-400">{errors.llm_model}</p>
          )}
        </div>

        {/* Custom model input (OpenRouter only) */}
        {showCustomModel && (
          <Input
            label="Custom Model ID"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
            placeholder="e.g. mistralai/mistral-7b-instruct"
            error={errors.llm_model}
          />
        )}

        {/* API Key */}
        <Input
          label={API_KEY_LABELS[state.llm_provider]}
          type="password"
          value={state.llm_api_key}
          onChange={e => set('llm_api_key', e.target.value)}
          placeholder="Your API key..."
          error={errors.llm_api_key}
          helperText="Stored encrypted on our VPS. Only readable by your agent container."
        />

        <button
          onClick={next}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors"
        >
          Continue →
        </button>
      </div>
    </WizardLayout>
  );
}
