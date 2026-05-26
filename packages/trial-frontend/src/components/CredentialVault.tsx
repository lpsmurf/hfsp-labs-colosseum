import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';
import WalletWarningBanner from './WalletWarningBanner';
import {
  buildVaultAuthHeaders,
  useWalletEncryption,
} from '../hooks/useWalletEncryption';
import { vaultClient } from '../services/api';
import type { CredentialMap } from '../crypto/types';

type VaultStatus = 'connected' | 'entering' | 'encrypting' | 'success';

interface ExtraCredential {
  id: number;
  name: string;
  value: string;
}

export interface CredentialVaultSuccess {
  agentId: string;
  vaultId: string;
  walletAddress: string;
  credentialNames: string[];
}

interface CredentialVaultProps {
  agentId: string;
  onSuccess?: (result: CredentialVaultSuccess) => void;
  onError?: (error: Error) => void;
}

export function CredentialVault({ agentId, onSuccess, onError }: CredentialVaultProps) {
  const walletControls = useWallet();
  const { publicKey, signMessage, connected } = walletControls;
  const { encrypt, isReady, wallet } = useWalletEncryption(agentId);

  const nextCredentialId = useRef(1);
  const [status, setStatus] = useState<VaultStatus>('connected');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [extraCredentials, setExtraCredentials] = useState<ExtraCredential[]>([]);
  const [botTokenError, setBotTokenError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState<CredentialVaultSuccess | null>(null);

  const vaultState = !connected
    ? 'wallet not connected'
    : status === 'success'
      ? 'success'
      : status === 'encrypting'
        ? 'encrypting'
        : telegramBotToken || llmApiKey || extraCredentials.length > 0
          ? 'entering creds'
          : 'connected';

  function addCredentialRow() {
    const id = nextCredentialId.current;
    nextCredentialId.current += 1;
    setExtraCredentials((rows) => [...rows, { id, name: '', value: '' }]);
  }

  function updateCredentialRow(id: number, patch: Partial<ExtraCredential>) {
    setExtraCredentials((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function removeCredentialRow(id: number) {
    setExtraCredentials((rows) => rows.filter((row) => row.id !== id));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBotTokenError('');
    setFormError('');

    const credentials = buildCredentialMap();
    if (!credentials) return;

    try {
      setStatus('encrypting');
      const encrypted = await encrypt(credentials);
      const authHeaders = await buildVaultAuthHeaders(publicKey, signMessage);
      const response = await vaultClient.storeCredentials(agentId, encrypted, authHeaders);
      const result = {
        agentId,
        vaultId: response.id,
        walletAddress: wallet.address ?? '',
        credentialNames: Object.keys(credentials),
      };
      setSuccess(result);
      setStatus('success');
      onSuccess?.(result);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Credential vault setup failed.');
      setStatus('entering');
      setFormError(normalized.message);
      onError?.(normalized);
    }
  }

  function buildCredentialMap(): CredentialMap | null {
    const token = telegramBotToken.trim();
    if (!token) {
      setBotTokenError('Telegram bot token is required.');
      return null;
    }

    const credentials: CredentialMap = { TELEGRAM_BOT_TOKEN: token };
    if (llmApiKey.trim()) {
      credentials.LLM_API_KEY = llmApiKey.trim();
    }

    for (const row of extraCredentials) {
      const name = row.name.trim();
      const value = row.value.trim();
      if (!name && !value) continue;
      if (!name || !value) {
        setFormError('Each extra credential needs both a name and a value.');
        return null;
      }
      if (credentials[name]) {
        setFormError(`${name} is already defined.`);
        return null;
      }
      credentials[name] = value;
    }

    return credentials;
  }

  return (
    <div className="space-y-4">
      <WalletWarningBanner />

      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-outline">Vault state</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Agent ID <span className="font-mono text-on-surface">{agentId}</span>
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-primary">
            {vaultState}
          </span>
        </div>
      </div>

      {!connected ? (
        <WalletConnectPanel />
      ) : status === 'success' && success ? (
        <div className="rounded-2xl border border-secondary/30 bg-secondary/10 p-5">
          <div className="flex items-start gap-3">
            <span className="ms text-[22px] text-secondary" aria-hidden>
              check_circle
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-on-surface">Credentials encrypted</h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                Vault entry <span className="font-mono text-on-surface">{success.vaultId}</span> is ready.
              </p>
              <p className="mt-2 font-mono text-xs text-secondary">
                {success.credentialNames.length} credential{success.credentialNames.length === 1 ? '' : 's'} stored
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" aria-busy={status === 'encrypting'}>
          <div className="space-y-1.5">
            <label htmlFor="telegram-bot-token" className="block text-sm font-medium text-on-surface">
              Telegram Bot Token <span className="text-error">*</span>
            </label>
            <input
              id="telegram-bot-token"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={telegramBotToken}
              onChange={(event) => {
                setTelegramBotToken(event.target.value);
                setStatus('entering');
                setBotTokenError('');
              }}
              placeholder="123456789:ABCdef..."
              aria-invalid={botTokenError ? 'true' : undefined}
              aria-describedby={botTokenError ? 'telegram-bot-token-error' : 'telegram-bot-token-help'}
              className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 font-mono text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            {botTokenError ? (
              <p id="telegram-bot-token-error" className="text-xs text-error">{botTokenError}</p>
            ) : (
              <p id="telegram-bot-token-help" className="text-xs text-on-surface-variant">
                Stored locally encrypted before it reaches the vault.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="llm-api-key" className="block text-sm font-medium text-on-surface">
              LLM API Key
            </label>
            <input
              id="llm-api-key"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={llmApiKey}
              onChange={(event) => {
                setLlmApiKey(event.target.value);
                setStatus('entering');
              }}
              placeholder="Optional BYOK secret"
              className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 font-mono text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <p className="text-xs text-on-surface-variant">
              Leave blank when using Poly managed keys.
            </p>
          </div>

          {extraCredentials.length > 0 && (
            <div className="space-y-3">
              {extraCredentials.map((row) => (
                <div key={row.id} className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <label htmlFor={`credential-name-${row.id}`} className="block text-xs font-medium text-on-surface-variant">
                      Name
                    </label>
                    <input
                      id={`credential-name-${row.id}`}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.name}
                      onChange={(event) => updateCredentialRow(row.id, { name: event.target.value })}
                      placeholder="HELIUS_API_KEY"
                      className="min-h-10 w-full rounded-xl border border-outline-variant bg-surface-container px-3 py-2 font-mono text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`credential-value-${row.id}`} className="block text-xs font-medium text-on-surface-variant">
                      Value
                    </label>
                    <input
                      id={`credential-value-${row.id}`}
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      value={row.value}
                      onChange={(event) => updateCredentialRow(row.id, { value: event.target.value })}
                      placeholder="Secret value"
                      className="min-h-10 w-full rounded-xl border border-outline-variant bg-surface-container px-3 py-2 font-mono text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCredentialRow(row.id)}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-3 text-error transition-colors hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:self-end"
                    aria-label="Remove credential"
                  >
                    <span className="ms text-[18px]" aria-hidden>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {formError && (
            <div className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error" role="alert">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={addCredentialRow}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 font-mono text-sm text-on-surface-variant transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <span className="ms text-[18px]" aria-hidden>add</span>
              Add credential
            </button>
            <button
              type="submit"
              disabled={!isReady || status === 'encrypting'}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-mono text-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {status === 'encrypting' ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
                  Encrypting
                </>
              ) : (
                <>
                  <span className="ms text-[18px]" aria-hidden>lock</span>
                  Encrypt and store
                </>
              )}
            </button>
          </div>

          {!signMessage && (
            <p className="text-xs text-error">
              This wallet cannot sign messages, so it cannot protect a vault entry.
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export function WalletConnectPanel() {
  const { wallets, wallet, connecting, select, connect } = useWallet();
  const [selectedWalletName, setSelectedWalletName] = useState<WalletName | null>(null);
  const [connectRequested, setConnectRequested] = useState(false);
  const [walletError, setWalletError] = useState('');

  const availableWallets = useMemo(
    () => wallets.filter((item) => item.readyState !== WalletReadyState.Unsupported),
    [wallets]
  );

  const selectedWallet = availableWallets.find((item) => item.adapter.name === selectedWalletName) ?? null;

  useEffect(() => {
    if (selectedWalletName || availableWallets.length === 0) return;
    const preferred =
      availableWallets.find((item) => item.readyState === WalletReadyState.Installed) ??
      availableWallets.find((item) => item.readyState === WalletReadyState.Loadable) ??
      availableWallets[0];
    setSelectedWalletName(preferred.adapter.name);
  }, [availableWallets, selectedWalletName]);

  useEffect(() => {
    if (!connectRequested || !selectedWalletName || wallet?.adapter.name !== selectedWalletName) return;

    setConnectRequested(false);
    connect().catch((error: unknown) => {
      setWalletError(error instanceof Error ? error.message : 'Wallet connection failed.');
    });
  }, [connect, connectRequested, selectedWalletName, wallet]);

  function handleConnect() {
    if (!selectedWalletName) {
      setWalletError('Choose a wallet to continue.');
      return;
    }

    setWalletError('');
    select(selectedWalletName);
    setConnectRequested(true);
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-on-surface">Connect wallet</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            The same wallet signs encryption, storage, and future revoke requests.
          </p>
        </div>

        {availableWallets.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="zk-wallet-select" className="block text-sm font-medium text-on-surface">
              Wallet
            </label>
            <select
              id="zk-wallet-select"
              value={selectedWalletName ?? ''}
              onChange={(event) => setSelectedWalletName(event.target.value as WalletName)}
              className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {availableWallets.map((item) => (
                <option key={item.adapter.name} value={item.adapter.name}>
                  {item.adapter.name} ({item.readyState})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-error">No supported Solana wallet adapters are available.</p>
        )}

        {selectedWallet?.readyState === WalletReadyState.NotDetected && (
          <a
            href={selectedWallet.adapter.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center rounded-xl text-sm font-medium text-secondary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Install {selectedWallet.adapter.name}
          </a>
        )}

        {walletError && (
          <div className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error" role="alert">
            {walletError}
          </div>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || availableWallets.length === 0}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-mono text-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {connecting ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
              Connecting
            </>
          ) : (
            <>
              <span className="ms text-[18px]" aria-hidden>account_balance_wallet</span>
              Connect wallet
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default CredentialVault;
