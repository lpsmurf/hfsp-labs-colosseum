import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateAgent } from '../hooks/useAgents'
import { apiClient } from '../services/api'

type Step = 'intro' | 'setup' | 'subscription' | 'deploying' | 'pairing' | 'success'
type Provider = 'anthropic' | 'openai' | 'openrouter'

const MODELS: Record<Provider, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
    { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
    { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
  ],
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
    { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
  ],
  openrouter: [
    { label: 'Auto (best)', value: 'openrouter/auto' },
    { label: 'GPT-4o (OR)', value: 'openai/gpt-4o' },
    { label: 'Claude 3.5 Sonnet (OR)', value: 'anthropic/claude-3.5-sonnet' },
    { label: 'Llama 3.1 405B (OR)', value: 'meta-llama/llama-3.1-405b-instruct' },
  ],
}

const PLANS = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    price: 'Free',
    period: '14 days',
    features: ['1 agent', 'Public bot', 'Basic support'],
    color: 'text-green-600 dark:text-green-400',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/month',
    features: ['Unlimited agents', 'Private bot', 'Priority support'],
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited agents', 'SLA', 'Dedicated support'],
    color: 'text-purple-600 dark:text-purple-400',
  },
]

const STEP_ORDER: Step[] = ['intro', 'setup', 'subscription', 'deploying', 'pairing', 'success']

const DEPLOY_PHASES = [
  { label: 'Creating container', after: 0 },
  { label: 'Installing Openclaw', after: 30 },
  { label: 'Configuring agent', after: 60 },
  { label: 'Starting services', after: 90 },
  { label: 'Ready for pairing', after: 121 }, // only shown on success
]

const API_KEY_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic API Key',
  openai: 'OpenAI API Key',
  openrouter: 'OpenRouter API Key',
}
const API_KEY_PLACEHOLDER: Record<Provider, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  openrouter: 'sk-or-...',
}

export function Deploy() {
  const navigate = useNavigate()
  const createAgent = useCreateAgent()

  const [step, setStep]           = useState<Step>('intro')
  const [agentName, setAgentName] = useState('')
  const [provider, setProvider]   = useState<Provider>('anthropic')
  const [model, setModel]         = useState(MODELS.anthropic[0].value)
  const [botToken, setBotToken]   = useState('')
  const [apiKey, setApiKey]       = useState('')
  const [selectedPlan, setSelectedPlan] = useState('free_trial')

  const [agentId, setAgentId]           = useState('')
  const [deployError, setDeployError]   = useState('')
  const [countdown, setCountdown]       = useState(120)
  const [pairingCode, setPairingCode]   = useState('')
  const [pairingError, setPairingError] = useState('')
  const [pairingLoading, setPairingLoading] = useState(false)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Countdown + polling during deploying step
  useEffect(() => {
    if (step !== 'deploying') return

    setCountdown(120)
    setDeployError('')

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          setStep('pairing')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    if (agentId) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await apiClient.getAxios().get(`/agents/${agentId}`)
          const agent = res.data?.agent ?? res.data
          const status = agent?.status
          if (status === 'awaiting_pairing' || status === 'active') {
            clearInterval(countdownRef.current!)
            clearInterval(pollingRef.current!)
            setStep('pairing')
          } else if (status === 'failed') {
            clearInterval(countdownRef.current!)
            clearInterval(pollingRef.current!)
            setDeployError('Provisioning failed. Please try again.')
          }
        } catch {
          // ignore transient fetch errors
        }
      }, 3000)
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (pollingRef.current)   clearInterval(pollingRef.current)
    }
  }, [step, agentId])

  function changeProvider(p: Provider) {
    setProvider(p)
    setModel(MODELS[p][0].value)
    setApiKey('')
  }

  function validate(): string {
    if (!agentName.trim())  return 'Agent name is required'
    if (!botToken.trim())   return 'Bot token is required'
    if (!apiKey.trim())     return 'API key is required'
    return ''
  }

  async function handleDeploy() {
    setDeployError('')
    try {
      const result = await createAgent.mutateAsync({
        name: agentName.trim(),
        provider,
        model,
        botToken: botToken.trim(),
        ...(provider === 'anthropic' ? { anthropicApiKey: apiKey } : {}),
        ...(provider === 'openai'    ? { openaiApiKey: apiKey }    : {}),
        ...(provider === 'openrouter'? { openrouterApiKey: apiKey }: {}),
      })
      setAgentId((result as { id?: string } & typeof result).id ?? '')
      setStep('deploying')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : 'Failed to create agent. Try again.')
      setDeployError(msg)
    }
  }

  async function handlePair() {
    if (!pairingCode.trim()) return
    setPairingLoading(true)
    setPairingError('')
    try {
      await apiClient.getAxios().post(`/agents/${agentId}/pair`, {
        pairingCode: pairingCode.trim().toUpperCase(),
      })
      setStep('success')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Pairing failed. Check your code and try again.'
      setPairingError(msg)
    } finally {
      setPairingLoading(false)
    }
  }

  function reset() {
    setStep('intro')
    setAgentName('')
    setProvider('anthropic')
    setModel(MODELS.anthropic[0].value)
    setBotToken('')
    setApiKey('')
    setSelectedPlan('free_trial')
    setAgentId('')
    setDeployError('')
    setCountdown(120)
    setPairingCode('')
    setPairingError('')
    setPairingLoading(false)
  }

  // Progress bar (0-100%)
  const pIdx = STEP_ORDER.indexOf(step)
  const progressPct = step === 'success' ? 100 : Math.round((pIdx / (STEP_ORDER.length - 2)) * 100)

  const elapsed = 120 - countdown

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Top progress bar */}
      {step !== 'success' && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700 w-full sticky top-0 z-10">
          <div className="h-1 bg-blue-600 transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* ── INTRO ────────────────────────────────────────────────── */}
        {step === 'intro' && (
          <div className="space-y-6">
            <div className="text-center pt-4">
              <p className="text-5xl mb-3">🦞</p>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Deploy Openclaw</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">Your AI agent on your own VPS</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 space-y-3 border border-gray-100 dark:border-gray-700">
              {['⏱ Takes ~2 minutes', '🔑 Bring your own LLM key', '🖥 Runs on your VPS', '🔒 Full control'].map((t) => (
                <p key={t} className="text-gray-700 dark:text-gray-300 text-sm">{t}</p>
              ))}
            </div>
            <button onClick={() => setStep('setup')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl">
              Get Started →
            </button>
          </div>
        )}

        {/* ── SETUP ────────────────────────────────────────────────── */}
        {step === 'setup' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Setup Your Agent</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Step 1 of 3 — Bot & AI config</p>
            </div>

            {/* Agent name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Name *</label>
              <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)}
                placeholder="My Assistant"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Bot token */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telegram Bot Token *</label>
              <input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)}
                placeholder="Get from @BotFather"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LLM Provider</label>
              <div className="flex gap-2">
                {(['anthropic', 'openai', 'openrouter'] as Provider[]).map((p) => (
                  <button key={p} onClick={() => changeProvider(p)}
                    className={`flex-1 py-2.5 px-2 rounded-xl text-sm font-medium border transition-colors ${
                      provider === p
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                    {p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'OpenRouter'}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MODELS[provider].map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* API key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {API_KEY_LABEL[provider]} *
              </label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={API_KEY_PLACEHOLDER[provider]}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {deployError ? (
              <p className="text-red-500 text-sm text-center">{deployError}</p>
            ) : null}

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setDeployError(''); setStep('intro') }}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium">
                ← Back
              </button>
              <button
                onClick={() => {
                  const err = validate()
                  if (err) { setDeployError(err); return }
                  setDeployError('')
                  setStep('subscription')
                }}
                className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── SUBSCRIPTION ─────────────────────────────────────────── */}
        {step === 'subscription' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose a Plan</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Step 2 of 3 — Subscription</p>
            </div>

            <div className="space-y-3">
              {PLANS.map((plan) => (
                <button key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                    selectedPlan === plan.id
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{plan.name}</p>
                      <div className="mt-1.5 space-y-0.5">
                        {plan.features.map((f) => (
                          <p key={f} className="text-xs text-gray-500 dark:text-gray-400">✓ {f}</p>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className={`font-bold text-lg ${plan.color}`}>{plan.price}</p>
                      {plan.period ? <p className="text-xs text-gray-400">{plan.period}</p> : null}
                    </div>
                  </div>
                  {selectedPlan === plan.id && (
                    <div className="mt-2 flex justify-end">
                      <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Selected ✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {deployError ? (
              <p className="text-red-500 text-sm text-center">{deployError}</p>
            ) : null}

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setDeployError(''); setStep('setup') }}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium">
                ← Back
              </button>
              <button onClick={handleDeploy} disabled={createAgent.isLoading}
                className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold">
                {createAgent.isLoading ? 'Creating...' : '🚀 Deploy Now'}
              </button>
            </div>
          </div>
        )}

        {/* ── DEPLOYING ────────────────────────────────────────────── */}
        {step === 'deploying' && (
          <div className="space-y-6">
            <div className="text-center pt-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">⚙️ Deploying…</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Setting up your agent on the VPS</p>
            </div>

            {/* Countdown ring */}
            <div className="flex justify-center">
              <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="50" fill="none" stroke="currentColor"
                    className="text-gray-200 dark:text-gray-700" strokeWidth="8" />
                  <circle cx="56" cy="56" r="50" fill="none" stroke="currentColor"
                    className="text-blue-600 transition-all duration-1000"
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - countdown / 120)}`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{countdown}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">sec</p>
                </div>
              </div>
            </div>

            {/* Progress steps */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-3">
              {DEPLOY_PHASES.slice(0, -1).map((phase, i) => {
                const nextAfter = DEPLOY_PHASES[i + 1]?.after ?? 999
                const done    = elapsed > nextAfter
                const current = elapsed >= phase.after && elapsed <= nextAfter
                return (
                  <div key={phase.label} className="flex items-center gap-3">
                    {current ? (
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : done ? (
                      <span className="text-green-500 flex-shrink-0 text-base">✅</span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0 inline-block" />
                    )}
                    <span className={`text-sm ${done || current ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                      {phase.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {deployError ? (
              <div className="text-center space-y-3">
                <p className="text-red-500 text-sm">{deployError}</p>
                <button onClick={reset}
                  className="px-6 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-medium text-sm">
                  Try Again
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* ── PAIRING ──────────────────────────────────────────────── */}
        {step === 'pairing' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🔗 Pair Your Bot</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Almost done! One last step.</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
              {[
                'Open your Telegram bot',
                'Send /start to the bot',
                'The bot will reply with a pairing code',
                'Enter the code below',
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 text-sm">{s}</span>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pairing Code</label>
              <input
                type="text"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                placeholder="e.g. PJDNQ3VU"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-lg tracking-widest placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {pairingError ? (
              <p className="text-red-500 text-sm text-center">{pairingError}</p>
            ) : null}

            <button onClick={handlePair} disabled={pairingLoading || !pairingCode.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-4 rounded-2xl">
              {pairingLoading ? 'Pairing…' : 'Pair Bot ✓'}
            </button>
          </div>
        )}

        {/* ── SUCCESS ──────────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6">
            <p className="text-8xl">🎉</p>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bot Deployed!</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                Your Openclaw agent is live and ready.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={() => navigate('/agents')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl">
                View My Agents
              </button>
              <button onClick={reset}
                className="w-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-2xl">
                Deploy Another
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default Deploy
