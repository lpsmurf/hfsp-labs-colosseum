import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../context/WizardContext';

type DeployStep = {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
};

const DEPLOY_STEPS: Omit<DeployStep, 'status'>[] = [
  { id: 'submit', label: 'Submitting deployment request' },
  { id: 'provision', label: 'Provisioning container on VPS' },
  { id: 'secrets', label: 'Writing secrets & config' },
  { id: 'docker', label: 'Starting Docker container' },
  { id: 'telegram', label: 'Connecting Telegram bot' },
  { id: 'ready', label: 'Agent ready for pairing' },
];

const STATUS_TO_STEP: Record<string, number> = {
  provisioning: 1,
  creating_dirs: 2,
  writing_secrets: 2,
  starting_container: 3,
  connecting_telegram: 4,
  awaiting_pairing: 5,
  active: 5,
};

export function DeployPage() {
  const navigate = useNavigate();
  const { state, set } = useWizard();
  const [steps, setSteps] = useState<DeployStep[]>(
    DEPLOY_STEPS.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' }))
  );
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const advanceTo = (stepIndex: number) => {
    setSteps(prev =>
      prev.map((s, i) => ({
        ...s,
        status: i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending',
      }))
    );
  };

  const markAllDone = () =>
    setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));

  const markError = (stepIndex: number) => {
    setSteps(prev =>
      prev.map((s, i) => ({
        ...s,
        status: i === stepIndex ? 'error' : i < stepIndex ? 'done' : 'pending',
      }))
    );
  };

  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    let id = '';

    const submit = async () => {
      try {
        const token = localStorage.getItem('authToken') ?? '';
        const res = await fetch('/api/v1/agents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: state.agent_name,
            provider: state.llm_provider,
            model: state.llm_model,
            botToken: state.telegram_token,
            [`${state.llm_provider}ApiKey`]: state.llm_api_key,
          }),
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('Invalid JSON from server:', text, 'Status:', res.status);
          markError(0);
          setError(`Server error (${res.status}): ${res.statusText || 'Invalid response'}`);
          return;
        }

        if (!res.ok || !data.success) {
          markError(0);
          setError(data.error || `HTTP ${res.status}: ${res.statusText}`);
          return;
        }

        id = data.agent?.id ?? '';
        set('agent_id', id);
        advanceTo(1);

        // Poll for status
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/v1/agents/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const statusText = await statusRes.text();
            let statusData;
            try {
              statusData = JSON.parse(statusText);
            } catch {
              return; // Ignore parse errors during polling
            }

            const agent = statusData.agent ?? statusData;
            const status: string = agent?.status ?? agent?.provisioning_status ?? '';

            const stepIdx = STATUS_TO_STEP[status] ?? 1;
            advanceTo(stepIdx);

            if (status === 'awaiting_pairing' || status === 'active') {
              if (pollRef.current) clearInterval(pollRef.current);
              if (agent.gatewayToken) set('gateway_token', agent.gatewayToken);
              if (agent.dashboardPort) set('dashboard_port', Number(agent.dashboardPort));
              markAllDone();
              setTimeout(() => navigate('/pair'), 800);
            } else if (status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current);
              markError(stepIdx);
              setError(agent?.error_message || 'Deployment failed on the server. Check logs.');
            }
          } catch {
            // network blip — keep polling
          }
        }, 2500);
      } catch (err: any) {
        markError(0);
        setError(err?.message || 'Network error. Please try again.');
      }
    };

    submit();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasError = !!error;

  return (
    <WizardLayout
      currentStep={5}
      title={hasError ? 'Deployment failed' : 'Deploying your agent'}
      subtitle={hasError ? 'Something went wrong. Details below.' : 'This usually takes 15–30 seconds.'}
    >
      <div className="space-y-4">
        {/* Steps */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          {steps.map(step => (
            <div key={step.id} className="flex items-center gap-3">
              <StepIcon status={step.status} />
              <span className={`text-sm ${
                step.status === 'done' ? 'text-gray-300' :
                step.status === 'active' ? 'text-white font-medium' :
                step.status === 'error' ? 'text-red-400' :
                'text-gray-600'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Error details */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3">
            <p className="text-sm text-red-300 font-medium">Error Details</p>
            <p className="text-sm text-red-400 font-mono text-xs">{error}</p>
            <div className="text-xs text-gray-500 space-y-1">
              <p>Things to check:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Auth token is valid (required for full testing)</li>
                <li>Telegram token format is valid: <code className="bg-gray-900 px-1 rounded">123456789:ABCdef...</code></li>
                <li>LLM API key is valid and has credits</li>
              </ul>
            </div>
            <button
              onClick={() => navigate('/configure')}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              ← Go Back & Fix
            </button>
          </div>
        )}

        {/* Waiting note */}
        {!hasError && (
          <p className="text-center text-xs text-gray-600">
            Hang tight — we're spinning up your container on the VPS.
          </p>
        )}
      </div>
    </WizardLayout>
  );
}

function StepIcon({ status }: { status: DeployStep['status'] }) {
  if (status === 'done') return (
    <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs shrink-0">✓</span>
  );
  if (status === 'active') return (
    <span className="w-5 h-5 shrink-0 flex items-center justify-center">
      <span className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </span>
  );
  if (status === 'error') return (
    <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs shrink-0">✗</span>
  );
  return (
    <span className="w-5 h-5 rounded-full bg-gray-800 border border-gray-700 shrink-0" />
  );
}
