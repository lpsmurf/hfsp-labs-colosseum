import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { agentAPI } from '../services/api';
// OpenClaw-compatible model IDs: provider/model-name
const MODELS = {
    anthropic: [
        { label: 'Claude 3.5 Sonnet (Recommended)', value: 'anthropic/claude-3-5-sonnet' },
        { label: 'Claude 3 Opus (Most Capable)', value: 'anthropic/claude-3-opus' },
        { label: 'Claude 3 Sonnet', value: 'anthropic/claude-3-sonnet' },
    ],
    openai: [
        { label: 'GPT-4o (Recommended)', value: 'openai/gpt-4o' },
        { label: 'GPT-4 Turbo', value: 'openai/gpt-4-turbo' },
        { label: 'GPT-3.5 Turbo (Fast)', value: 'openai/gpt-3.5-turbo' },
    ],
    openrouter: [
        { label: 'Auto — best available', value: 'openrouter/auto' },
        { label: 'GPT-4o (via OpenRouter)', value: 'openai/gpt-4o' },
        { label: 'Claude 3.5 Sonnet (via OpenRouter)', value: 'anthropic/claude-3.5-sonnet' },
        { label: 'Llama 3.1 405B (via OpenRouter)', value: 'meta-llama/llama-3.1-405b-instruct' },
        { label: 'Gemini Pro 1.5 (via OpenRouter)', value: 'google/gemini-pro-1.5' },
    ],
    kimi: [
        { label: 'Kimi k1.5 (Recommended)', value: 'moonshot/kimi-k1-5' },
        { label: 'Moonshot v1 128k (Longest)', value: 'moonshot/moonshot-v1-128k' },
        { label: 'Moonshot v1 32k', value: 'moonshot/moonshot-v1-32k' },
        { label: 'Moonshot v1 8k (Fast)', value: 'moonshot/moonshot-v1-8k' },
    ],
};
const PROVIDER_LABELS = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    kimi: 'Kimi',
};
const KEY_PLACEHOLDERS = {
    anthropic: 'sk-ant-...',
    openai: 'sk-...',
    openrouter: 'sk-or-...',
    kimi: 'sk-...',
};
const KEY_HINTS = {
    anthropic: 'Get your key at console.anthropic.com',
    openai: 'Get your key at platform.openai.com/api-keys',
    openrouter: 'Get your key at openrouter.ai/keys — access 200+ models',
    kimi: 'Get your key at platform.moonshot.cn — long context, great for code',
};
export default function CreateAgentPage() {
    const [name, setName] = useState('');
    const [provider, setProvider] = useState('anthropic');
    const [model, setModel] = useState(MODELS.anthropic[0].value);
    const [botToken, setBotToken] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const handleProviderChange = (p) => {
        setProvider(p);
        setModel(MODELS[p][0].value);
        setApiKey('');
        setError('');
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim())
            return setError('Agent name is required.');
        if (!botToken.trim())
            return setError('Telegram bot token is required.');
        if (!apiKey.trim())
            return setError(`${PROVIDER_LABELS[provider]} API key is required.`);
        setLoading(true);
        setError('');
        try {
            await agentAPI.createAgent({
                name: name.trim(),
                provider,
                model,
                botToken: botToken.trim(),
                openaiApiKey: provider === 'openai' ? apiKey.trim() : undefined,
                anthropicApiKey: provider === 'anthropic' ? apiKey.trim() : undefined,
                openrouterApiKey: provider === 'openrouter' ? apiKey.trim() : undefined,
                kimiApiKey: provider === 'kimi' ? apiKey.trim() : undefined,
            });
            navigate('/');
        }
        catch (err) {
            setError(err.response?.data?.error || 'Failed to create agent. Please try again.');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-gray-50 py-12 px-4", children: _jsxs("div", { className: "max-w-lg mx-auto", children: [_jsx(Link, { to: "/", className: "text-blue-600 hover:underline text-sm mb-6 inline-block", children: "\u2190 Back to Dashboard" }), _jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 p-8", children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 mb-1", children: "Create New Agent" }), _jsx("p", { className: "text-gray-500 text-sm mb-8", children: "Your agent will run in an isolated container and connect to your Telegram bot." }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [error && (_jsx("div", { className: "bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm", children: error })), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Agent Name" }), _jsx("input", { type: "text", required: true, value: name, onChange: e => setName(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm", placeholder: "My Assistant", maxLength: 64 })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Telegram Bot Token" }), _jsx("input", { type: "password", required: true, value: botToken, onChange: e => setBotToken(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm", placeholder: "1234567890:ABCDefgh..." }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: ["Create a bot via ", _jsx("strong", { children: "@BotFather" }), " on Telegram and paste the token here."] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "LLM Provider" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: ['anthropic', 'openai', 'openrouter', 'kimi'].map(p => (_jsx("button", { type: "button", onClick: () => handleProviderChange(p), className: `py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${provider === p
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`, children: PROVIDER_LABELS[p] }, p))) }), provider === 'openrouter' && (_jsx("p", { className: "text-xs text-gray-500 mt-1.5", children: "Access 200+ models with a single API key via openrouter.ai" })), provider === 'kimi' && (_jsx("p", { className: "text-xs text-gray-500 mt-1.5", children: "Moonshot AI \u2014 long context windows, strong at coding and reasoning" }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Model" }), _jsx("select", { value: model, onChange: e => setModel(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm", children: MODELS[provider].map(m => (_jsx("option", { value: m.value, children: m.label }, m.value))) })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: [PROVIDER_LABELS[provider], " API Key"] }), _jsx("input", { type: "password", required: true, value: apiKey, onChange: e => setApiKey(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm", placeholder: KEY_PLACEHOLDERS[provider] }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: KEY_HINTS[provider] })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm mt-2", children: loading ? 'Provisioning agent…' : 'Create & Provision Agent' })] })] }), _jsx("p", { className: "text-xs text-gray-400 text-center mt-4", children: "Your API key is encrypted at rest and never shared." })] }) }));
}
