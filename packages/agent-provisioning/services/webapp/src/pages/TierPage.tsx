import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard, TierId } from '../context/WizardContext';

interface Tier {
  id: TierId;
  name: string;
  badge?: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: string;
  highlight: boolean;
}

const TIERS: Tier[] = [
  {
    id: 'free_trial',
    name: 'Hobbyist',
    price: 'Free',
    priceNote: '7-day trial · 1 agent max',
    features: [
      '1 AI agent deployment',
      'Telegram bot integration',
      'Any LLM provider (your API key)',
      'Basic on-chain tools',
      'Community support',
    ],
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'Most Popular',
    price: '$9 USDC',
    priceNote: 'per month · unlimited agents',
    features: [
      'Unlimited AI agents',
      'Telegram bot integration',
      'Any LLM provider (your API key)',
      'Full on-chain toolkit (swaps, transfers, NFTs)',
      'Wallet analytics & price feeds',
      'Priority support',
    ],
    cta: 'Go Pro',
    highlight: true,
  },
];

export function TierPage() {
  const navigate = useNavigate();
  const { state, set } = useWizard();

  const select = (id: TierId) => {
    set('tier_id', id);
    navigate('/configure');
  };

  return (
    <WizardLayout
      currentStep={2}
      title="Choose your plan"
      subtitle="You can upgrade anytime."
      maxWidth="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TIERS.map(tier => (
          <button
            key={tier.id}
            onClick={() => select(tier.id)}
            className={`relative text-left rounded-xl border p-6 transition-all outline-none focus:ring-2 focus:ring-violet-500 ${
              tier.highlight
                ? 'bg-violet-600/10 border-violet-500/50 hover:border-violet-400'
                : 'bg-gray-900 border-gray-800 hover:border-gray-600'
            } ${
              state.tier_id === tier.id ? 'ring-2 ring-violet-500' : ''
            }`}
          >
            {tier.badge && (
              <span className="absolute top-4 right-4 text-xs bg-violet-500 text-white px-2 py-0.5 rounded-full font-medium">
                {tier.badge}
              </span>
            )}

            <div className="mb-4">
              <div className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">
                {tier.name}
              </div>
              <div className="text-3xl font-extrabold text-white">{tier.price}</div>
              <div className="text-xs text-gray-500 mt-0.5">{tier.priceNote}</div>
            </div>

            <ul className="space-y-2 mb-6">
              {tier.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-violet-400 mt-0.5 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <div className={`w-full py-2.5 rounded-lg text-sm font-semibold text-center transition-colors ${
              tier.highlight
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
            }`}>
              {tier.cta} →
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-gray-600 mt-4">
        Payments accepted in USDC, SOL, USDT, or HERD on Solana.
      </p>
    </WizardLayout>
  );
}
