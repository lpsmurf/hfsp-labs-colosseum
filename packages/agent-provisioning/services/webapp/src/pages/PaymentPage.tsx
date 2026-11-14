import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../context/WizardContext';

const RECIPIENT = 'DS8uG9qrzAFtuZX9yrQ1648r7tNKGWdH6ywZJLZ5LDB7';
const PRICE_USD = 9;

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { cache: 'no-store' }
    );
    const data = await res.json();
    return data.solana.usd as number;
  } catch {
    return 0;
  }
}

export function PaymentPage() {
  const navigate = useNavigate();
  const { state, set } = useWizard();
  const isFree = state.tier_id === 'free_trial';

  const [solPrice, setSolPrice] = useState<number>(0);
  const [solAmount, setSolAmount] = useState<number>(0);
  const [paying, setPaying] = useState(false);
  const [txSig, setTxSig] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isFree) return;
    fetchSolPrice().then(price => {
      setSolPrice(price);
      if (price > 0) setSolAmount(+(PRICE_USD / price).toFixed(6));
    });
  }, [isFree]);

  const proceedFree = () => navigate('/deploy');

  const payWithPhantom = async () => {
    setError('');
    setPaying(true);
    try {
      const phantom = (window as any).phantom?.solana ?? (window as any).solana;
      if (!phantom) throw new Error('Phantom wallet not found. Please install it first.');

      // Dynamically import web3.js to avoid SSR issues
      const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, clusterApiUrl } = await import('@solana/web3.js');

      const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
      const fromPubkey = phantom.publicKey as InstanceType<typeof PublicKey>;
      const toPubkey = new PublicKey(RECIPIENT);
      const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey,
      }).add(
        SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
      );

      const { signature } = await phantom.signAndSendTransaction(tx);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      set('payment_tx_hash', signature);
      setTxSig(signature);
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Transaction failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (isFree) {
    return (
      <WizardLayout currentStep={4} title="No payment required" subtitle="Your free trial is ready to go.">
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-white font-semibold mb-1">Hobbyist Plan — Free</div>
            <div className="text-gray-500 text-sm">7-day trial · 1 agent · No credit card needed</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-400 space-y-1">
            <p className="font-medium text-gray-300">What's included:</p>
            <p>✓ 1 AI agent deployment</p>
            <p>✓ Telegram bot integration</p>
            <p>✓ Your LLM provider & model</p>
          </div>
          <button
            onClick={proceedFree}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors"
          >
            Deploy for Free →
          </button>
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout currentStep={4} title="Complete payment" subtitle="Pay with your connected Phantom wallet.">
      <div className="space-y-5">
        {/* Price card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold">Pro Plan</div>
              <div className="text-gray-500 text-sm">$9 USD · 1 month</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-violet-400">$9</div>
              {solPrice > 0 && (
                <div className="text-xs text-gray-500 mt-0.5">
                  ≈ {solAmount} SOL
                </div>
              )}
            </div>
          </div>

          {solPrice > 0 ? (
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 flex justify-between">
              <span>Live SOL price</span>
              <span className="text-white">${solPrice.toLocaleString()} / SOL</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
              Fetching live SOL price...
            </div>
          )}
        </div>

        {/* Payment destination */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p className="text-gray-300 font-medium text-sm">Payment destination</p>
          <p className="font-mono break-all text-gray-400">{RECIPIENT}</p>
          <p className="text-gray-600">HFSP Labs treasury · Solana Devnet</p>
        </div>

        {/* Success state */}
        {done && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-green-400 font-semibold text-sm mb-1">✓ Payment confirmed!</p>
            <p className="font-mono text-xs text-gray-400 break-all">{txSig}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!done ? (
          <button
            onClick={payWithPhantom}
            disabled={paying || solAmount === 0}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {paying && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {paying ? 'Waiting for Phantom...' : `Pay ${solAmount > 0 ? solAmount + ' SOL' : '...'} with Phantom →`}
          </button>
        ) : (
          <button
            onClick={() => navigate('/deploy')}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
          >
            Continue to Deploy →
          </button>
        )}

        <p className="text-center text-xs text-gray-600">
          Transaction confirmed on Solana Devnet before proceeding.
        </p>
      </div>
    </WizardLayout>
  );
}
