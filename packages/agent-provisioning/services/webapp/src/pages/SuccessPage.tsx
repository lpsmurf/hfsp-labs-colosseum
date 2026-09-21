import { useNavigate } from 'react-router-dom';
import { useWizard } from '../context/WizardContext';

export function SuccessPage() {
  const navigate = useNavigate();
  const { state, reset } = useWizard();

  const deployAnother = () => {
    reset();
    navigate('/');
  };

  const downloadAccessCard = () => {
    const now = new Date().toISOString();
    const lines = [
      '╔════════════════════════════════════════╗',
      '║        HFSP AGENT ACCESS CARD          ║',
      '╚════════════════════════════════════════╝',
      '',
      `Agent Name   : ${state.agent_name || '—'}`,
      `Reference ID : ${state.agent_id || '—'}`,
      `Plan         : ${state.tier_id === 'pro' ? 'Pro' : 'Hobbyist (Trial)'}`,
      `LLM          : ${state.llm_provider} / ${state.llm_model}`,
      `Wallet       : ${state.wallet || '—'}`,
      `Deployed     : ${now}`,
      '',
      '── OpenClaw Gateway ──────────────────────',
      `Gateway Token: ${state.gateway_token || '(available after first launch)'}`,
      `Gateway Port : ${state.dashboard_port || '—'}`,
      '',
      '── SSH Access ────────────────────────────',
      'Your agent runs inside a managed container.',
      'Contact support with your Reference ID to',
      'request direct SSH access if needed.',
      '',
      '── Support ───────────────────────────────',
      'support@hfsp.cloud',
      `Reference: ${state.agent_id || '—'}`,
      '',
      '═══════════════════════════════════════════',
      'Keep this file safe — treat the Gateway',
      'Token like a password.',
    ];
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hfsp-agent-${(state.agent_id || 'access').slice(-8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Animated checkmark */}
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
          <span className="text-4xl">✓</span>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2">You're live!</h1>
          <p className="text-gray-400 text-base">
            <span className="text-violet-300 font-medium">{state.agent_name || 'Your agent'}</span> is
            deployed and ready.
          </p>
        </div>

        {/* Summary card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left space-y-3">
          <Row label="Agent" value={state.agent_name} />
          <Row label="Plan" value={state.tier_id === 'pro' ? 'Pro' : 'Hobbyist (Trial)'} />
          <Row label="LLM" value={`${state.llm_provider} / ${state.llm_model}`} mono />
          <Row label="Wallet" value={state.wallet ? `${state.wallet.slice(0, 6)}...${state.wallet.slice(-4)}` : '—'} mono />
          {state.agent_id && (
            <div className="pt-2 border-t border-gray-800">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Reference ID</span>
                <span className="font-mono text-xs text-violet-300 select-all">{state.agent_id}</span>
              </div>
            </div>
          )}
        </div>

        {/* What's next */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">What's next</p>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-violet-400 shrink-0">📱</span>
              Open Telegram and start chatting with your bot
            </li>
            <li className="flex items-start gap-2">
              <span className="text-violet-400 shrink-0">⛓️</span>
              Ask it to check your SOL balance, swap tokens, or get prices
            </li>
            <li className="flex items-start gap-2">
              <span className="text-violet-400 shrink-0">🔑</span>
              Fund your agent's wallet to enable on-chain transactions
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={downloadAccessCard}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>⬇</span> Download Access Card
          </button>
          <button
            onClick={deployAnother}
            className="w-full py-2.5 bg-gray-900 border border-gray-800 hover:border-gray-600 text-gray-300 text-sm font-medium rounded-xl transition-colors"
          >
            Deploy Another Agent
          </button>
        </div>

        <p className="text-xs text-gray-600">
          Save your access card — it contains your gateway token and support reference.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
