import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformClient } from '../services/api'
import PaymentModal from '../components/PaymentModal'
import type { LLMProvider, PlatformAgentStatus, SubscriptionTier, PaymentToken } from '../types/api'

type Step = 'intro' | 'wallet' | 'payment' | 'llm' | 'config' | 'deploying' | 'success'

const STEP_ORDER: Step[] = ['intro', 'wallet', 'payment', 'llm', 'config', 'deploying', 'success']

type ByokProvider = 'anthropic' | 'openai' | 'openrouter' | 'google'

const BYOK_MODELS: Record<ByokProvider, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
    { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
    { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
  ],
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
    { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
  ],
  openrouter: [
    { label: 'Auto (best)', value: 'openrouter/auto' },
    { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' },
    { label: 'GPT-4o', value: 'openai/gpt-4o' },
    { label: 'Llama 3.1 405B', value: 'meta-llama/llama-3.1-405b-instruct' },
  ],
  google: [
    { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
    { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
  ],
}

const BYOK_KEY_PLACEHOLDER: Record<ByokProvider, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  openrouter: 'sk-or-...',
  google: 'AIza...',
}

const TIERS: { id: SubscriptionTier; name: string; price: string; badge?: string; description: string }[] = [
  { id: 'free_trial', name: 'Free Trial', price: '0.10 SOL (one-time)', badge: '7 days', description: '1 agent · 100K tokens · Verify you are a builder' },
  { id: 'starter', name: 'Builder', price: '$29 / mo', description: '1 agent · 1M tokens/mo · Full access' },
]

const PAYMENT_TOKENS: PaymentToken[] = ['USDC', 'USDT', 'SOL']

const IS_DEVNET = import.meta.env.VITE_SOLANA_NETWORK === 'devnet'

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function Deploy() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('intro')
  const [wallet, setWallet] = useState('')

  // Payment
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('starter')
  const [paymentToken, setPaymentToken] = useState<PaymentToken>('USDC')
  const [paymentError, setPaymentError] = useState('')
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)

  // LLM
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('poly')
  const [byokProvider, setByokProvider] = useState<ByokProvider>('anthropic')
  const [byokModel, setByokModel] = useState(BYOK_MODELS.anthropic[0].value)
  const [byokKey, setByokKey] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customKey, setCustomKey] = useState('')

  // Agent config
  const [agentName, setAgentName] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')

  // Deploy state
  const [deployedAgentId, setDeployedAgentId] = useState('')
  const [deployStatus, setDeployStatus] = useState<PlatformAgentStatus | null>(null)
  const [deployError, setDeployError] = useState('')
  const [telegramDeeplink, setTelegramDeeplink] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [deeplinkCopied, setDeeplinkCopied] = useState(false)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const progressPct = step === 'success'
    ? 100
    : Math.round((STEP_ORDER.indexOf(step) / (STEP_ORDER.length - 2)) * 100)

  // ── Step: wallet ──────────────────────────────────────────────────────────

  async function connectAndAuth() {
    setPaymentError('')
    const provider = window.solana?.isPhantom ? window.solana : null
    if (!provider) {
      window.open('https://phantom.app/download', '_blank')
      return
    }
    try {
      const resp = await provider.connect()
      const address = resp.publicKey.toBase58()
      setWallet(address)

      // Sign a nonce to prove ownership
      const nonce = Math.floor(Math.random() * 1e12).toString()
      const message = `Sign in to Openclaw\nNonce: ${nonce}`
      const encoded = new TextEncoder().encode(message)
      const { signature } = await provider.signMessage(encoded, 'utf8')
      const sigHex = bytesToHex(signature)

      await platformClient.loginWithWallet(address, sigHex, message)

      // Check existing subscription to skip payment if already active
      const sub = await platformClient.getSubscription()
      if (sub?.status === 'active') {
        setStep('llm')
      } else {
        setStep('payment')
      }
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Wallet connection failed.')
    }
  }

  // ── Step: deploy ──────────────────────────────────────────────────────────

  function changeByokProvider(p: ByokProvider) {
    setByokProvider(p)
    setByokModel(BYOK_MODELS[p][0].value)
    setByokKey('')
  }

  function validateLlm(): string {
    if (llmProvider === 'byok' && !byokKey.trim()) return 'API key is required for BYOK'
    if (llmProvider === 'custom' && !customEndpoint.trim()) return 'Custom endpoint URL is required'
    return ''
  }

  async function handleDeploy() {
    const llmErr = validateLlm()
    if (llmErr) { setDeployError(llmErr); return }
    if (!agentName.trim()) { setDeployError('Agent name is required'); return }
    if (!telegramBotToken.trim()) { setDeployError('Telegram bot token is required'); return }

    setDeployError('')
    setDeployStatus(null)

    try {
      const result = await platformClient.deployAgent({
        name: agentName.trim(),
        llm_provider: llmProvider,
        telegram_bot_token: telegramBotToken.trim(),
        ...(llmProvider === 'byok' ? {
          llm_model: byokModel,
          provider_name: byokProvider,
          api_key: byokKey.trim(),
        } : {}),
        ...(llmProvider === 'custom' ? {
          custom_endpoint: customEndpoint.trim(),
          ...(customKey.trim() ? { api_key: customKey.trim() } : {}),
        } : {}),
      })
      setDeployedAgentId(result.agent.id)
      setDeployStatus(result.agent.status)
      if (result.telegram_deeplink) setTelegramDeeplink(result.telegram_deeplink)
      if (result.pair_code) setPairCode(result.pair_code)
      setStep('deploying')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Deploy failed. Please try again.')
      setDeployError(msg)
    }
  }

  // ── Poll agent status after deploy ────────────────────────────────────────

  const pollStatus = useCallback(async () => {
    if (!deployedAgentId) return
    try {
      const agent = await platformClient.getAgent(deployedAgentId)
      setDeployStatus(agent.status)
      if (agent.status === 'active') {
        if (pollingRef.current) clearInterval(pollingRef.current)
        setStep('success')
      } else if (agent.status === 'failed') {
        if (pollingRef.current) clearInterval(pollingRef.current)
        setDeployError('Deployment failed. Please try again.')
      }
    } catch {
      // ignore transient errors
    }
  }, [deployedAgentId])

  useEffect(() => {
    if (step !== 'deploying') return
    pollingRef.current = setInterval(pollStatus, 3000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [step, pollStatus])

  function reset() {
    setStep('intro')
    setWallet('')
    setSelectedTier('starter')
    setPaymentToken('USDC')
    setPaymentError('')
    setPaymentModalOpen(false)
    setLlmProvider('poly')
    setByokProvider('anthropic')
    setByokModel(BYOK_MODELS.anthropic[0].value)
    setByokKey('')
    setCustomEndpoint('')
    setCustomKey('')
    setAgentName('')
    setDeployedAgentId('')
    setDeployStatus(null)
    setDeployError('')
    setTelegramDeeplink('')
    setPairCode('')
    setDeeplinkCopied(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {IS_DEVNET && (
        <div className="w-full py-2 text-center text-xs font-mono" style={{ background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
          DEVNET MODE — Payments are bypassed for testing
        </div>
      )}
      {step !== 'success' && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700 w-full sticky top-0 z-10">
          <div className="h-1 bg-blue-600 transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* ── INTRO ─────────────────────────────────────────────────── */}
        {step === 'intro' && (
          <div className="space-y-6">
            <div className="text-center pt-4">
              <p className="text-5xl mb-3">🦞</p>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Deploy Your Agent</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">24/7 autonomous Solana agent. Yours.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 space-y-3 border border-gray-100 dark:border-gray-700">
              {[
                '⏱ Deploys in under 2 minutes',
                '🔑 Poly keys or bring your own',
                '🌐 170+ Solana tools via Agent Kit',
                '🔒 Isolated per-user container',
              ].map((t) => (
                <p key={t} className="text-gray-700 dark:text-gray-300 text-sm">{t}</p>
              ))}
            </div>
            <button
              onClick={() => setStep('wallet')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl"
            >
              Get Started →
            </button>
          </div>
        )}

        {/* ── WALLET / AUTH ─────────────────────────────────────────── */}
        {step === 'wallet' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Connect Wallet</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Step 1 — Sign in with Phantom</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Connect your Phantom wallet to authenticate and manage your subscription. No funds are transferred at this step.
              </p>
              {wallet && (
                <p className="text-xs font-mono text-green-600 dark:text-green-400">
                  ✅ Connected: {wallet.slice(0, 6)}…{wallet.slice(-4)}
                </p>
              )}
            </div>
            {paymentError && <p className="text-red-500 text-sm text-center">{paymentError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('intro')}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium">
                ← Back
              </button>
              <button onClick={() => void connectAndAuth()}
                className="flex-[2] py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold">
                Connect Phantom →
              </button>
            </div>
          </div>
        )}

        {/* ── PAYMENT ───────────────────────────────────────────────── */}
        {step === 'payment' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose Plan</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Step 2 — Subscribe with Solana</p>
            </div>

            <div className="space-y-3">
              {TIERS.map((tier) => (
                <button key={tier.id} onClick={() => setSelectedTier(tier.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                    selectedTier === tier.id
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {tier.name}
                        {tier.badge && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full ml-1">
                            {tier.badge}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tier.description}</p>
                    </div>
                    <p className="font-bold text-blue-600 dark:text-blue-400 text-sm ml-3 flex-shrink-0">{tier.price}</p>
                  </div>
                </button>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pay with</p>
              <div className="flex gap-2">
                {PAYMENT_TOKENS.map((tok) => (
                  <button key={tok} onClick={() => setPaymentToken(tok)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      paymentToken === tok
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                    {tok}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400 text-center">
              Don't have SOL or USDC?{' '}
              <a
                href="https://www.moonpay.com/buy/sol"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline hover:text-sky-300"
              >
                Buy with card via MoonPay →
              </a>
            </p>

            {paymentError && <p className="text-red-500 text-sm text-center">{paymentError}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep('wallet')}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium">
                ← Back
              </button>
              <button onClick={() => { setPaymentError(''); setPaymentModalOpen(true) }}
                className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold">
                Review Payment →
              </button>
            </div>

            <PaymentModal
              open={paymentModalOpen}
              tier={selectedTier}
              token={paymentToken}
              walletAddress={wallet}
              onClose={() => setPaymentModalOpen(false)}
              onSuccess={() => {
                setPaymentModalOpen(false)
                setPaymentError('')
                setStep('llm')
              }}
            />
          </div>
        )}

        {/* ── LLM SETUP ────────────────────────────────────────────── */}
        {step === 'llm' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose Your AI</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Step 3 — How will your agent think?</p>
            </div>

            {/* Provider type */}
            <div className="space-y-2">
              {(['poly', 'byok', 'custom'] as LLMProvider[]).map((p) => (
                <button key={p} onClick={() => setLlmProvider(p)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                    llmProvider === p
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {p === 'poly' ? '🤖 Poly keys (managed)' : p === 'byok' ? '🔑 Bring your own key' : '🔗 Custom endpoint'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {p === 'poly' ? 'We provide the API — tokens deducted from your plan budget' : p === 'byok' ? 'Your API key, your billing — we just route requests' : 'Self-hosted Llama, Mistral, or any OpenAI-compatible API'}
                  </p>
                </button>
              ))}
            </div>

            {/* BYOK config */}
            {llmProvider === 'byok' && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Provider</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['anthropic', 'openai', 'openrouter', 'google'] as ByokProvider[]).map((p) => (
                      <button key={p} onClick={() => changeByokProvider(p)}
                        className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                          byokProvider === p
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                  <select value={byokModel} onChange={(e) => setByokModel(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {BYOK_MODELS[byokProvider].map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key *</label>
                  <input type="password" value={byokKey} onChange={(e) => setByokKey(e.target.value)}
                    placeholder={BYOK_KEY_PLACEHOLDER[byokProvider]}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            {/* Custom endpoint config */}
            {llmProvider === 'custom' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endpoint URL *</label>
                  <input type="url" value={customEndpoint} onChange={(e) => setCustomEndpoint(e.target.value)}
                    placeholder="https://your-server.com/v1"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key (optional)</label>
                  <input type="password" value={customKey} onChange={(e) => setCustomKey(e.target.value)}
                    placeholder="Bearer token for your endpoint"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setStep('payment')}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium">
                ← Back
              </button>
              <button onClick={() => {
                const err = validateLlm()
                if (err) { setDeployError(err); return }
                setDeployError('')
                setStep('config')
              }}
                className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                Next →
              </button>
            </div>
            {deployError && <p className="text-red-500 text-sm text-center">{deployError}</p>}
          </div>
        )}

        {/* ── AGENT CONFIG ──────────────────────────────────────────── */}
        {step === 'config' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Name Your Agent</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Step 4 — Almost there</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Name *</label>
              <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)}
                placeholder="My Solana Agent"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telegram Bot Token *</label>
              <input type="password" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="123456789:ABCdef..."
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
              <p className="mt-1 text-xs text-gray-400">Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline text-blue-400">@BotFather</a> and paste the token here.</p>
            </div>

            {/* Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2 text-sm">
              <p className="font-semibold text-gray-900 dark:text-white">Summary</p>
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>LLM</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {llmProvider === 'poly' ? 'Poly (managed)' : llmProvider === 'byok' ? `${byokProvider} · ${byokModel}` : 'Custom endpoint'}
                </span>
              </div>
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>Wallet</span>
                <span className="text-gray-900 dark:text-white font-mono text-xs">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
              </div>
            </div>

            {deployError && <p className="text-red-500 text-sm text-center">{deployError}</p>}

            <div className="flex gap-3">
              <button onClick={() => { setDeployError(''); setStep('llm') }}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium">
                ← Back
              </button>
              <button onClick={() => void handleDeploy()} disabled={!agentName.trim() || !telegramBotToken.trim()}
                className="flex-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold">
                🚀 Deploy Now
              </button>
            </div>
          </div>
        )}

        {/* ── DEPLOYING ─────────────────────────────────────────────── */}
        {step === 'deploying' && (
          <div className="space-y-6">
            <div className="text-center pt-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">⚙️ Deploying…</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Spinning up your isolated container</p>
            </div>
            <div className="flex justify-center">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2">
              {[
                { label: 'Creating network', done: true },
                { label: 'Starting MCP server', done: deployStatus !== null },
                { label: 'Starting agent runtime', done: deployStatus === 'active' },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-3">
                  {done
                    ? <span className="text-green-500 flex-shrink-0">✅</span>
                    : <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  }
                  <span className={`text-sm ${done ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>{label}</span>
                </div>
              ))}
            </div>
            {deployError && (
              <div className="text-center space-y-3">
                <p className="text-red-500 text-sm">{deployError}</p>
                <button onClick={reset}
                  className="px-6 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-medium text-sm">
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SUCCESS ───────────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="space-y-6 pt-4">
            <div className="text-center">
              <p className="text-6xl mb-3">🎉</p>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Deployed!</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                <span className="font-semibold text-gray-900 dark:text-white">{agentName}</span> is live and running 24/7.
              </p>
            </div>

            {/* Telegram pairing */}
            {telegramDeeplink && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💬</span>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Pair your Telegram bot</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click the link below to open Telegram and start your agent</p>
                  </div>
                </div>

                {pairCode && (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Pair code</p>
                    <p className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400 tracking-widest">{pairCode}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Expires in 1 hour</p>
                  </div>
                )}

                <a href={telegramDeeplink} target="_blank" rel="noreferrer"
                   className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm">
                  <span>Open in Telegram →</span>
                </a>

                <button onClick={() => {
                  navigator.clipboard.writeText(telegramDeeplink)
                  setDeeplinkCopied(true)
                  setTimeout(() => setDeeplinkCopied(false), 2000)
                }}
                  className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium">
                  {deeplinkCopied ? '✅ Copied!' : '📋 Copy invite link'}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button onClick={() => navigate('/agents')}
                className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-semibold py-3 rounded-2xl text-sm">
                View My Agents
              </button>
              <button onClick={reset}
                className="w-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-2xl text-sm">
                Deploy Another Agent
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default Deploy
