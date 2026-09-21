import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { label: 'Wallet', path: '/connect' },
  { label: 'Tier', path: '/tier' },
  { label: 'Configure', path: '/configure' },
  { label: 'Payment', path: '/payment' },
  { label: 'Deploy', path: '/deploy' },
  { label: 'Pairing', path: '/pair' },
];

interface WizardLayoutProps {
  children: ReactNode;
  currentStep: number; // 1-based
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg';
}

export function WizardLayout({ children, currentStep, title, subtitle, maxWidth = 'md' }: WizardLayoutProps) {
  const navigate = useNavigate();
  const canGoBack = currentStep > 1 && currentStep < 5; // No back during deploy/pair

  const widthClass = { sm: 'max-w-sm', md: 'max-w-xl', lg: 'max-w-2xl' }[maxWidth];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        {canGoBack && (
          <button
            onClick={() => navigate(-1)}
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
          >
            ← Back
          </button>
        )}
        <div className="flex items-center gap-2 mr-auto">
          <span className="font-bold text-white tracking-tight">ClawDrop</span>
          <span className="text-gray-600 text-xs">by HFSP</span>
        </div>
        <span className="text-xs text-gray-500">Step {currentStep} of {STEPS.length}</span>
      </header>

      {/* Step indicator */}
      <div className="px-6 pt-5 pb-1">
        <div className="flex gap-1.5 max-w-xl mx-auto">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i + 1 <= currentStep ? 'bg-violet-500' : 'bg-gray-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className={`w-full ${widthClass}`}>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-gray-400 mt-1 text-sm">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
