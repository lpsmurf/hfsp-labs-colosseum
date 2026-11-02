import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../context/WizardContext';
import Input from '../components/shared/Input';

export function PairingPage() {
  const navigate = useNavigate();
  const { state } = useWizard();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pair = async () => {
    const cleaned = code.trim().toUpperCase();
    if (!cleaned || cleaned.length < 6) {
      setError('Enter the pairing code from your Telegram bot.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/agents/${state.agent_id}/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken') ?? ''}`,
        },
        body: JSON.stringify({ pairingCode: cleaned }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        navigate('/success');
      } else {
        setError(data.error || 'Invalid pairing code. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <WizardLayout
      currentStep={6}
      title="Pair with Telegram"
      subtitle="Almost there — activate your bot in Telegram."
    >
      <div className="space-y-5">
        {/* Instructions card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <p className="text-sm font-medium text-gray-300">Follow these steps:</p>

          <ol className="space-y-4">
            <Step n={1} title="Open your bot in Telegram">
              <p className="text-gray-500 text-xs mt-1">
                Search for the bot you created with BotFather, or find it at:
              </p>
              <div className="mt-1 bg-gray-800 rounded-lg px-3 py-2 font-mono text-xs text-violet-300">
                https://t.me/[your-bot-username]
              </div>
            </Step>

            <Step n={2} title='Send "/start" to your bot'>
              <p className="text-gray-500 text-xs mt-1">
                Your agent will respond with a <span className="text-white">pairing code</span> — a short code like{' '}
                <span className="font-mono text-violet-300">PAIR-A1B2C3</span> or similar.
              </p>
            </Step>

            <Step n={3} title="Paste the pairing code below">
              <p className="text-gray-500 text-xs mt-1">
                Copy the code exactly as shown in the bot message.
              </p>
            </Step>
          </ol>
        </div>

        {/* Code input */}
        <Input
          label="Pairing Code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="PAIR-A1B2C3"
          maxLength={20}
          error={error}
          className="font-mono tracking-widest text-center text-lg"
        />

        {/* Common issues */}
        <details className="group">
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
            Bot not responding? See common issues ▾
          </summary>
          <div className="mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-1.5">
            <p><span className="text-yellow-400">409 Conflict:</span> The token is already used by another running bot. Create a new one in BotFather.</p>
            <p><span className="text-yellow-400">No response:</span> Container may still be starting. Wait 30 seconds and try again.</p>
            <p><span className="text-yellow-400">Wrong code:</span> Codes are case-sensitive — copy exactly as shown.</p>
          </div>
        </details>

        <button
          onClick={pair}
          disabled={loading || !code.trim()}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {loading ? 'Pairing...' : 'Complete Setup →'}
        </button>

        <button
          onClick={() => navigate('/success')}
          className="w-full py-2 text-gray-600 hover:text-gray-400 text-xs transition-colors"
        >
          Skip for now (I'll pair later)
        </button>
      </div>
    </WizardLayout>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        {children}
      </div>
    </li>
  );
}
