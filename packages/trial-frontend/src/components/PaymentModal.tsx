import { useEffect, useMemo, useState } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { platformClient } from '../services/api';
import type { PaymentQuote, PaymentToken, SubscriptionTier } from '../types/api';
import type { PhantomProvider } from '../types/phantom';

type PaymentState = 'idle' | 'loading_quote' | 'opening' | 'sending' | 'confirming' | 'verifying';

interface PaymentModalProps {
  open: boolean;
  tier: SubscriptionTier;
  token: PaymentToken;
  walletAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free_trial: 'Free Trial',
  starter: 'Builder',
};

const TOKEN_MINTS: Partial<Record<PaymentToken, { mint: string; decimals: number }>> = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
};

const IS_DEVNET = import.meta.env.VITE_SOLANA_NETWORK === 'devnet';
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL ?? (IS_DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildPhantomBrowseUrl() {
  const currentUrl = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return `https://phantom.app/ul/browse/${currentUrl}?ref=${ref}`;
}

function truncateAddress(address: string, chars = 4) {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function parseUnits(amount: string, decimals: number): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Payment amount is not available for this token yet.');
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0');
}

async function sendWithPhantom(
  provider: PhantomProvider,
  transaction: Transaction,
  connection: Connection
) {
  if (provider.sendTransaction) {
    return provider.sendTransaction(transaction, connection, { skipPreflight: false });
  }

  if (provider.signAndSendTransaction) {
    const result = await provider.signAndSendTransaction(transaction);
    return typeof result === 'string' ? result : result.signature;
  }

  throw new Error('Your Phantom version cannot send this transaction from the browser.');
}

async function buildTransferTransaction(
  connection: Connection,
  payer: PublicKey,
  recipient: PublicKey,
  token: PaymentToken,
  amount: string
) {
  const transaction = new Transaction();

  if (token === 'SOL') {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipient,
        lamports: parseUnits(amount, 9),
      })
    );
  } else {
    const tokenConfig = TOKEN_MINTS[token];
    if (!tokenConfig) {
      throw new Error(`${token} payments are not available yet.`);
    }

    const mint = new PublicKey(tokenConfig.mint);
    const sourceAta = await getAssociatedTokenAddress(mint, payer);
    const sourceAccount = await connection.getAccountInfo(sourceAta);
    if (!sourceAccount) {
      throw new Error(`No ${token} balance found in this wallet.`);
    }

    const destinationAta = await getAssociatedTokenAddress(mint, recipient);
    const destinationAccount = await connection.getAccountInfo(destinationAta);
    if (!destinationAccount) {
      transaction.add(
        createAssociatedTokenAccountInstruction(payer, destinationAta, recipient, mint)
      );
    }

    transaction.add(
      createTransferInstruction(
        sourceAta,
        destinationAta,
        payer,
        parseUnits(amount, tokenConfig.decimals)
      )
    );
  }

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  transaction.feePayer = payer;
  transaction.recentBlockhash = latestBlockhash.blockhash;

  return { transaction, latestBlockhash };
}

export function PaymentModal({ open, tier, token, walletAddress, onClose, onSuccess }: PaymentModalProps) {
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<PaymentState>('idle');
  const [txSignature, setTxSignature] = useState('');
  const [copied, setCopied] = useState(false);

  const tokenQuote = quote?.tokens[token];
  const amount = tokenQuote?.amount ?? '';
  const canPay = Boolean(quote && walletAddress && amount && amount !== 'TBD');
  const isBusy = state === 'sending' || state === 'confirming' || state === 'verifying';

  const feeLabel = useMemo(() => {
    if (!quote) return 'Loading quote...';
    if (token === 'SOL') return 'Network fee shown in Phantom';
    return 'Includes token account setup if needed';
  }, [quote, token]);

  async function loadQuote() {
    setQuoteError('');
    setState('loading_quote');
    try {
      const nextQuote = await platformClient.getPaymentQuote(tier);
      setQuote(nextQuote);
      setState('idle');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Could not load the payment quote.');
      setQuoteError(message);
      setState('idle');
    }
  }

  useEffect(() => {
    if (!open) return;
    setError('');
    setTxSignature('');
    setCopied(false);
    void loadQuote();
  }, [open, tier]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isBusy) onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isBusy, onClose, open]);

  if (!open) return null;

  function openPhantomFallback() {
    setState('opening');
    if (isMobile()) {
      window.location.href = buildPhantomBrowseUrl();
      return;
    }
    window.open('https://phantom.app/download', '_blank', 'noopener,noreferrer');
    setError('Install Phantom, then return here to complete the payment.');
    setState('idle');
  }

  async function copyRecipient() {
    if (!quote?.recipient) return;
    await navigator.clipboard.writeText(quote.recipient);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function handlePay() {
    setError('');
    setTxSignature('');

    const provider = window.solana?.isPhantom ? window.solana : null;
    if (!provider) {
      openPhantomFallback();
      return;
    }

    if (!quote || !amount || amount === 'TBD') {
      setError('This payment option is not available yet.');
      return;
    }

    try {
      setState('sending');
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const connected = provider.publicKey?.toBase58()
        ? { publicKey: provider.publicKey }
        : await provider.connect();
      const payer = new PublicKey(connected.publicKey.toBase58());
      const recipient = new PublicKey(quote.recipient);
      const { transaction, latestBlockhash } = await buildTransferTransaction(
        connection,
        payer,
        recipient,
        token,
        amount
      );

      const signature = await sendWithPhantom(provider, transaction, connection);
      setTxSignature(signature);

      setState('confirming');
      await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed');

      setState('verifying');
      await platformClient.verifyPayment({
        tx_signature: signature,
        tier,
        token,
        wallet_address: payer.toBase58(),
      });

      onClose();
      onSuccess();
    } catch (err: unknown) {
      const rawMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Payment failed.');
      const message = /reject|cancel/i.test(rawMessage) ? 'Payment cancelled in Phantom.' : rawMessage;
      setError(message);
      setState('idle');
    }
  }

  const actionLabel =
    state === 'loading_quote' ? 'Loading quote...' :
    state === 'opening' ? 'Opening Phantom...' :
    state === 'sending' ? 'Approve in Phantom...' :
    state === 'confirming' ? 'Confirming transaction...' :
    state === 'verifying' ? 'Verifying payment...' :
    `Pay ${amount || ''} ${token}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-3 py-3 sm:items-center sm:px-6" role="presentation">
      <button
        type="button"
        aria-label="Close payment modal"
        onClick={() => { if (!isBusy) onClose(); }}
        className="absolute inset-0 h-full w-full cursor-default focus-visible:outline-none"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              Subscription payment
            </p>
            <h2 id="payment-modal-title" className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              Review transfer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="min-h-10 rounded-xl px-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Plan</span>
            <span className="font-semibold text-gray-900 dark:text-white">{TIER_LABELS[tier]}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Token</span>
            <span className="font-semibold text-gray-900 dark:text-white">{token}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Amount</span>
            {state === 'loading_quote' && !quote ? (
              <span className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            ) : (
              <span className="font-mono font-semibold tabular-nums text-gray-900 dark:text-white">
                {amount && amount !== 'TBD' ? `${amount} ${token}` : 'Unavailable'}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">USD value</span>
            <span className="font-mono tabular-nums text-gray-900 dark:text-white">
              {quote ? `$${quote.usd.toFixed(2)}` : '--'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Fee</span>
            <span className="text-right text-gray-700 dark:text-gray-300">{feeLabel}</span>
          </div>
        </div>

        {quote?.tokens.SOL.price_usd && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Live SOL price: <span className="font-mono tabular-nums">${quote.tokens.SOL.price_usd.toFixed(2)}</span>
          </p>
        )}

        {quote?.recipient && (
          <div className="mt-4 rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">Recipient</p>
                <p className="mt-1 truncate font-mono text-sm text-gray-900 dark:text-white" title={quote.recipient}>
                  {truncateAddress(quote.recipient, 6)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyRecipient()}
                className="min-h-10 rounded-xl border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {quoteError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
            <p>{quoteError}</p>
            <button
              type="button"
              onClick={() => void loadQuote()}
              className="mt-2 min-h-10 rounded-lg px-3 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Retry quote
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        {txSignature && (
          <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-900/20 dark:text-blue-300">
            Transaction: <span className="font-mono">{truncateAddress(txSignature, 8)}</span>
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={!canPay || Boolean(quoteError) || isBusy || state === 'loading_quote'}
            aria-busy={isBusy}
            className="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-gray-900"
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="min-h-12 rounded-xl px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Back to plans
          </button>
        </div>
      </section>
    </div>
  );
}

export default PaymentModal;
