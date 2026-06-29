import { useState } from 'react';
import { QRAddress } from './QRAddress';
import { quoteSolToGnosis, submitSolToGnosis, pollOrderStatus } from '../services/bridge';
import type { OrderStatus } from '../services/bridge';

interface Props {
  gnosisAddress: string;   // pre-filled from Circles wallet; empty string in standalone
  isMiniapp: boolean;
}

type Step = 'form' | 'quoted' | 'awaiting_tx' | 'confirming' | 'done' | 'error';

export function SwapSolToGnosis({ gnosisAddress: walletAddress, isMiniapp }: Props) {
  const [manualAddress, setManualAddress] = useState('');
  const [amount, setAmount]   = useState('');
  const [step, setStep]       = useState<Step>('form');
  const [quote, setQuote]     = useState<Awaited<ReturnType<typeof quoteSolToGnosis>> | null>(null);
  const [txSig, setTxSig]     = useState('');
  const [order, setOrder]     = useState<OrderStatus | null>(null);
  const [error, setError]     = useState('');

  // Use wallet address if in miniapp, otherwise use manual input
  const destAddress = isMiniapp ? walletAddress : manualAddress;

  async function handleQuote() {
    setError('');
    if (!destAddress.trim()) { setError('Enter your Gnosis Safe address'); return; }
    try {
      const q = await quoteSolToGnosis({ amountUsdc: parseFloat(amount), gnosisAddress: destAddress.trim() });
      setQuote(q);
      setStep('quoted');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSubmit() {
    setError('');
    setStep('confirming');
    try {
      const o = await submitSolToGnosis({
        amountUsdc:     parseFloat(amount),
        gnosisAddress:  destAddress.trim(),
        srcTxSignature: txSig.trim(),
      });
      setOrder(o);
      setStep('awaiting_tx');
      pollUntilDone(o.orderId);
    } catch (e) {
      setError((e as Error).message);
      setStep('quoted');
    }
  }

  async function pollUntilDone(orderId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const s = await pollOrderStatus(orderId);
        setOrder(s);
        if (s.status !== 'pending') { setStep('done'); return; }
      } catch { /* keep polling */ }
    }
    setStep('done');
  }

  if (step === 'done' && order) {
    return (
      <div style={styles.card}>
        <div style={{ color: order.status === 'fulfilled' ? '#3fb950' : '#f85149', fontSize: 32, textAlign: 'center' }}>
          {order.status === 'fulfilled' ? '✅' : '❌'}
        </div>
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          {order.status === 'fulfilled' ? 'Bridge complete! USDC arrived on Gnosis.' : 'Bridge failed or timed out.'}
        </p>
        {order.dstTxHash && (
          <p style={{ fontSize: 12, color: '#8b949e', marginTop: 8, wordBreak: 'break-all' }}>
            Gnosis tx: {order.dstTxHash}
          </p>
        )}
        <button style={styles.btn} onClick={() => { setStep('form'); setAmount(''); setTxSig(''); setOrder(null); }}>
          New Swap
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Solana USDC → Gnosis USDC</h3>

      <p style={styles.label}>Destination Gnosis Safe address</p>
      {isMiniapp && walletAddress ? (
        <input style={{ ...styles.input, color: '#8b949e' }} value={walletAddress} readOnly />
      ) : (
        <input
          style={styles.input}
          placeholder="0x737d274..."
          value={manualAddress}
          onChange={e => setManualAddress(e.target.value)}
          disabled={step !== 'form'}
        />
      )}

      <p style={styles.label}>Amount (USDC)</p>
      <input
        style={styles.input}
        type="number"
        min="1"
        step="0.01"
        placeholder="10.00"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        disabled={step !== 'form'}
      />

      {step === 'form' && (
        <button style={styles.btn} disabled={!amount || parseFloat(amount) <= 0 || !destAddress.trim()} onClick={handleQuote}>
          Get Quote
        </button>
      )}

      {step === 'quoted' && quote && (
        <>
          <div style={styles.quoteBox}>
            <Row label="You send" value={`$${quote.srcAmountUsdc} USDC (Solana)`} />
            <Row label="You receive" value={`~$${quote.dstAmountFormatted.toFixed(4)} USDC (Gnosis)`} />
            <Row label="Bridge fee" value={`$${quote.bridgeFeeUsdc.toFixed(4)}`} />
            <Row label="Est. time" value={`~${Math.round(quote.estimatedFillTimeMs / 1000)}s`} />
          </div>
          <QRAddress label="Send Solana USDC to this address" address={quote.depositAddress} network="solana" />
          <p style={styles.label}>Paste your Solana tx signature after sending</p>
          <input
            style={styles.input}
            placeholder="4wJqVT..."
            value={txSig}
            onChange={e => setTxSig(e.target.value)}
          />
          <button style={styles.btn} disabled={!txSig.trim()} onClick={handleSubmit}>
            Confirm & Bridge
          </button>
          <button style={{ ...styles.btn, background: 'transparent', border: '1px solid #30363d' }} onClick={() => setStep('form')}>
            Back
          </button>
        </>
      )}

      {step === 'confirming' && <p style={styles.status}>⏳ Submitting bridge order…</p>}
      {step === 'awaiting_tx' && <p style={styles.status}>⏳ Bridge in progress (~5–30s)…</p>}
      {error && <p style={{ color: '#f85149', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}

const styles = {
  card:    { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  heading: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  label:   { fontSize: 12, color: '#8b949e' },
  input:   {
    background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
    color: '#e6edf3', padding: '8px 12px', fontSize: 14, outline: 'none', width: '100%',
  },
  btn: {
    background: '#1f6feb', border: 'none', borderRadius: 6, color: '#fff',
    cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '10px 0', marginTop: 4,
  },
  quoteBox: { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 12 },
  status:   { color: '#8b949e', fontSize: 14, textAlign: 'center' as const, marginTop: 8 },
};
