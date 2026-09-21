import { useNavigate } from 'react-router-dom';

const STEPS_PREVIEW = [
  { icon: '👻', label: 'Connect Wallet', desc: 'Sign in with Phantom — no email needed' },
  { icon: '🎯', label: 'Pick Your Tier', desc: 'Choose the plan that fits your needs' },
  { icon: '⚙️', label: 'Configure Agent', desc: 'Name your bot, connect Telegram & LLM' },
  { icon: '💳', label: 'Pay & Deploy', desc: 'One-time setup, deployed in seconds' },
  { icon: '📱', label: 'Pair with Telegram', desc: 'Activate your bot with a pairing code' },
];

export function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-lg tracking-tight">ClawDrop</span>
          <span className="text-gray-600 text-xs">by HFSP</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-12 max-w-3xl mx-auto w-full">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-violet-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
            Mainnet Live
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight">
            Deploy your AI agent<br />
            <span className="text-violet-400">on Solana</span> in minutes
          </h1>

          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            ClawDrop provisions isolated AI agents powered by OpenClaw — each with their
            own Telegram bot, wallet, and LLM brain. No servers to manage. No DevOps required.
          </p>
        </div>

        {/* What you get */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: '🤖', label: 'Your own AI agent', desc: 'Fully isolated container on our VPS' },
            { icon: '📡', label: 'Telegram-first', desc: 'Interact via your personal bot 24/7' },
            { icon: '⛓️', label: 'Solana-native', desc: 'Trade, transfer, and monitor on-chain' },
          ].map(item => (
            <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="font-semibold text-sm text-white">{item.label}</div>
              <div className="text-gray-500 text-xs mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Steps preview */}
        <div className="w-full bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">How it works</p>
          <div className="space-y-3">
            {STEPS_PREVIEW.map((step, i) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                  {i + 1}
                </div>
                <span className="text-sm">{step.icon}</span>
                <div>
                  <span className="text-sm font-medium text-white">{step.label}</span>
                  <span className="text-gray-500 text-xs ml-2">— {step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate('/connect')}
          className="w-full sm:w-auto px-10 py-3.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors text-base"
        >
          Get Started →
        </button>

        <p className="text-gray-600 text-xs mt-4">
          You'll need a Phantom wallet and a Telegram account.
        </p>
      </main>
    </div>
  );
}
