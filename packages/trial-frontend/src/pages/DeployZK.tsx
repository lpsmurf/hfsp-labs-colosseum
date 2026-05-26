import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import CredentialVault, {
  type CredentialVaultSuccess,
  WalletConnectPanel,
} from '../components/CredentialVault';
import WalletWarningBanner from '../components/WalletWarningBanner';

type ZkStep = 'intro' | 'wallet' | 'credentials' | 'llm' | 'success';
type ZkLlmProvider = 'poly' | 'byok' | 'custom';

const STEPS: { id: ZkStep; label: string }[] = [
  { id: 'intro', label: 'Intro' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'llm', label: 'LLM Config' },
  { id: 'success', label: 'Success' },
];

const MODEL_OPTIONS: Record<Exclude<ZkLlmProvider, 'custom'>, { label: string; value: string }[]> = {
  poly: [
    { label: 'Poly Auto', value: 'poly/auto' },
    { label: 'Claude Haiku', value: 'anthropic/claude-haiku-4.5' },
  ],
  byok: [
    { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' },
    { label: 'GPT-4o', value: 'openai/gpt-4o' },
    { label: 'OpenRouter Auto', value: 'openrouter/auto' },
  ],
};

export function DeployZK() {
  const navigate = useNavigate();
  const { connected, publicKey } = useWallet();
  const [step, setStep] = useState<ZkStep>('intro');
  const [agentId, setAgentId] = useState(createAgentId);
  const [vaultResult, setVaultResult] = useState<CredentialVaultSuccess | null>(null);
  const [agentName, setAgentName] = useState('ZK Solana Agent');
  const [llmProvider, setLlmProvider] = useState<ZkLlmProvider>('poly');
  const [llmModel, setLlmModel] = useState(MODEL_OPTIONS.poly[0].value);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [llmError, setLlmError] = useState('');

  const currentStepIndex = STEPS.findIndex((item) => item.id === step);
  const progressPct = Math.round(((currentStepIndex + 1) / STEPS.length) * 100);
  const walletAddress = publicKey?.toBase58() ?? '';

  const summaryRows = useMemo(
    () => [
      { label: 'Agent ID', value: agentId },
      { label: 'Wallet', value: walletAddress ? truncateAddress(walletAddress, 6) : 'Not connected' },
      { label: 'Vault', value: vaultResult?.vaultId ? truncateAddress(vaultResult.vaultId, 8) : 'Pending' },
    ],
    [agentId, vaultResult?.vaultId, walletAddress]
  );

  function selectLlmProvider(provider: ZkLlmProvider) {
    setLlmProvider(provider);
    setLlmError('');
    if (provider === 'custom') return;
    setLlmModel(MODEL_OPTIONS[provider][0].value);
  }

  function completeLlmStep() {
    const name = agentName.trim();
    if (!name) {
      setLlmError('Agent name is required.');
      return;
    }

    if (llmProvider === 'custom' && !customEndpoint.trim()) {
      setLlmError('Custom endpoint URL is required.');
      return;
    }

    if (llmProvider === 'byok' && !vaultResult?.credentialNames.includes('LLM_API_KEY')) {
      setLlmError('Add an LLM API key in the credential vault or choose Poly.');
      return;
    }

    setLlmError('');
    setStep('success');
  }

  function resetFlow() {
    setStep('intro');
    setAgentId(createAgentId());
    setVaultResult(null);
    setAgentName('ZK Solana Agent');
    setLlmProvider('poly');
    setLlmModel(MODEL_OPTIONS.poly[0].value);
    setCustomEndpoint('');
    setLlmError('');
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="sticky top-0 z-10 h-1 bg-surface-container-high">
        <div
          className="h-1 bg-primary transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-secondary">Zero-knowledge deployment</p>
            <h1 className="mt-2 text-3xl font-bold text-on-surface sm:text-4xl">Deploy with wallet-encrypted credentials</h1>
            <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
              A separate flow for storing agent credentials in the vault before LLM configuration.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/deploy')}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 font-mono text-sm text-on-surface-variant transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Standard deploy
          </button>
        </header>

        <nav className="mb-6 grid grid-cols-5 gap-2" aria-label="ZK deployment progress">
          {STEPS.map((item, index) => {
            const isActive = item.id === step;
            const isDone = index < currentStepIndex;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!isDone}
                onClick={() => isDone && setStep(item.id)}
                className={`min-h-11 rounded-xl border px-2 py-2 text-center font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  isActive
                    ? 'border-primary bg-primary text-on-primary'
                    : isDone
                      ? 'border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/15'
                      : 'border-white/10 bg-white/5 text-outline'
                }`}
              >
                <span className="block text-[10px]">{index + 1}</span>
                <span className="block truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="glass-card rounded-3xl p-5 sm:p-8">
            {step === 'intro' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface">Start ZK deploy</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    This path signs with your Solana wallet, derives a local key, and stores only encrypted credential material.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: 'key', title: 'Wallet-bound', body: 'The decrypt key comes from your wallet signature.' },
                    { icon: 'lock', title: 'Encrypted first', body: 'Credentials are encrypted before storage.' },
                    { icon: 'delete', title: 'Revocable', body: 'Stopping an agent can revoke its vault entry.' },
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <span className="ms text-[22px] text-primary" aria-hidden>{item.icon}</span>
                      <h3 className="mt-3 text-sm font-semibold text-on-surface">{item.title}</h3>
                      <p className="mt-1 text-xs text-on-surface-variant">{item.body}</p>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setStep('wallet')}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-mono text-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  Continue to wallet
                  <span className="ms text-[18px]" aria-hidden>arrow_forward</span>
                </button>
              </div>
            )}

            {step === 'wallet' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface">Connect wallet</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Use the wallet you want tied to this agent credential vault.
                  </p>
                </div>

                {connected ? (
                  <div className="space-y-4">
                    <WalletWarningBanner />
                    <button
                      type="button"
                      onClick={() => setStep('credentials')}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-mono text-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      Continue to credentials
                      <span className="ms text-[18px]" aria-hidden>arrow_forward</span>
                    </button>
                  </div>
                ) : (
                  <WalletConnectPanel />
                )}
              </div>
            )}

            {step === 'credentials' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-on-surface">Credential vault</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Store the credentials your agent will need under this generated agent id.
                  </p>
                </div>
                <CredentialVault
                  agentId={agentId}
                  onSuccess={(result) => {
                    setVaultResult(result);
                    setStep('llm');
                  }}
                  onError={(error) => setLlmError(error.message)}
                />
              </div>
            )}

            {step === 'llm' && (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  completeLlmStep();
                }}
              >
                <div>
                  <h2 className="text-2xl font-bold text-on-surface">LLM config</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Choose the model routing metadata for this vault-backed agent.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="zk-agent-name" className="block text-sm font-medium text-on-surface">
                    Agent name <span className="text-error">*</span>
                  </label>
                  <input
                    id="zk-agent-name"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  />
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-on-surface">Provider</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['poly', 'byok', 'custom'] as ZkLlmProvider[]).map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => selectLlmProvider(provider)}
                        className={`min-h-12 rounded-xl border px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                          llmProvider === provider
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-white/10 bg-white/5 text-on-surface-variant hover:bg-white/10'
                        }`}
                      >
                        <span className="block text-sm font-semibold">
                          {provider === 'poly' ? 'Poly' : provider === 'byok' ? 'BYOK' : 'Custom'}
                        </span>
                        <span className="mt-1 block text-xs opacity-80">
                          {provider === 'poly' ? 'Managed key' : provider === 'byok' ? 'Vault key' : 'OpenAI-compatible'}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {llmProvider !== 'custom' ? (
                  <div className="space-y-1.5">
                    <label htmlFor="zk-llm-model" className="block text-sm font-medium text-on-surface">
                      Model
                    </label>
                    <select
                      id="zk-llm-model"
                      value={llmModel}
                      onChange={(event) => setLlmModel(event.target.value)}
                      className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      {MODEL_OPTIONS[llmProvider].map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="zk-custom-endpoint" className="block text-sm font-medium text-on-surface">
                      Custom endpoint <span className="text-error">*</span>
                    </label>
                    <input
                      id="zk-custom-endpoint"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      spellCheck={false}
                      value={customEndpoint}
                      onChange={(event) => setCustomEndpoint(event.target.value)}
                      placeholder="https://your-server.example/v1"
                      className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
                  </div>
                )}

                {llmError && (
                  <div className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error" role="alert">
                    {llmError}
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setStep('credentials')}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 font-mono text-sm text-on-surface-variant transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 font-mono text-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    Finish ZK setup
                    <span className="ms text-[18px]" aria-hidden>check</span>
                  </button>
                </div>
              </form>
            )}

            {step === 'success' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-secondary/30 bg-secondary/10 p-5">
                  <div className="flex items-start gap-3">
                    <span className="ms text-[24px] text-secondary" aria-hidden>verified</span>
                    <div>
                      <h2 className="text-2xl font-bold text-on-surface">ZK vault ready</h2>
                      <p className="mt-2 text-sm text-on-surface-variant">
                        {agentName.trim()} has encrypted credentials stored for wallet-signed access.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryTile label="Provider" value={llmProvider} />
                  <SummaryTile label="Model" value={llmProvider === 'custom' ? customEndpoint : llmModel} />
                  <SummaryTile label="Vault ID" value={vaultResult?.vaultId ?? 'Stored'} />
                  <SummaryTile label="Credentials" value={`${vaultResult?.credentialNames.length ?? 0} stored`} />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => navigate('/agents')}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 font-mono text-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    View agents
                  </button>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 font-mono text-sm text-on-surface-variant transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    Start another
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="glass-card rounded-3xl p-5">
              <h2 className="text-base font-semibold text-on-surface">Deployment summary</h2>
              <div className="mt-4 space-y-3">
                {summaryRows.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-outline">{row.label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-on-surface">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-5">
              <h2 className="text-base font-semibold text-on-surface">Credential custody</h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                Revoke uses the same wallet-signature auth as storage and stops the agent through the vault endpoint.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-outline">{label}</p>
      <p className="mt-1 break-all font-mono text-sm text-on-surface">{value}</p>
    </div>
  );
}

function createAgentId(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `zk-${randomId}`;
}

function truncateAddress(address: string, chars = 4): string {
  return address.length > chars * 2 + 3
    ? `${address.slice(0, chars)}...${address.slice(-chars)}`
    : address;
}

export default DeployZK;
