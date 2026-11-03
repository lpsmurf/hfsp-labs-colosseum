import { useState } from 'react';
import { QRAddress } from './QRAddress';
import { quoteGnosisToSol, submitGnosisToSol, pollOrderStatus } from '../services/bridge';
import type { OrderStatus } from '../services/bridge';

// Dynamic import so the build doesn't fail when SDK isn't installed yet
async function sendTransactions(txs: Array<{ to: string; data?: string; value?: string }>) {
  const sdk = await import('@aboutcircles/miniapp-sdk');
  return sdk.sendTransactions(txs);
}

// Gnosis Chain native USDC
const GNOSIS_USDC = '0x2a22f9c3b484c3629090feed35f17ff8f88f76f0';

// ERC-20 transfer(address,uint256) selector
function encodeErc20Transfer(to: string, amountMicro: bigint): string {
  const selector = '0xa9059cbb';
  const paddedTo  = to.slice(2).padStart(64, '0');
  const paddedAmt = amountMicro.toString(16).padStart(64, '0');
  return `${selector}${paddedTo}${paddedAmt}`;
}

interface Props {
  gnosisAddress: string | null;
  isMiniapp: boolean;
}

type Step = 'form' | 'quoted' | 'signing' | 'awaiting' | 'done' | 'error';

export function SwapGnosisToSol({ gnosisAddress, isMiniapp }: Props) {
  const [amount, setAmount]   = useState('');
  const [solDest, setSolDest] = useState('');
  const [step, setStep]       = useState<Step>('form');
  const [quote, setQuote]     = useState<Awaited<ReturnType<typeof quoteGnosisToSol>> | null>(null);
  const [order, setOrder]     = useState<OrderStatus | null>(null);
  const [error, setError]     = useState('');

  async function handleQuote() {
    setError('');
    try {
      const q = await quoteGnosisToSol({ amountUsdc: parseFloat(amount), solanaAddress: solDest.trim() });
      setQuote(q);
      setStep('quoted');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleBridge() {
    if (!quote) return;
    setError('');
    setStep('signing');

    const amountMicro = BigInt(Math.round(parseFloat(amount) * 1_000_000));

    let gnosisTxHash = '';

    if (isMiniapp && gnosisAddress) {
      // Use Circles SDK to sign + submit from user's Gnosis Safe
      try {
        const results = await sendTransactions([{
          to:    GNOSIS_USDC,
          data:  encodeErc20Transfer(quote.depositAddress, amountMicro),
          value: '0x0',
        }]);
        gnosisTxHash = Array.isArray(results) ? results[0] : (results as string);
      } catch (e) {
        setError(`Wallet signing failed: ${(e as Error).message}`);
        setStep('quoted');
        return;
      }
    } else {
      // Standalone mode — user must provide manual tx hash
      const hash = prompt(
        `Send ${amount} USDC (Gnosis) to:\n${quote.depositAddress}\n\nThen paste the tx hash here:`
      );
      if (!hash) { setStep('quoted'); return; }
      gnosisTxHash = hash.trim();
    }

    setStep('awaiting');
    try {
      const o = await submitGnosisToSol({
        amountUsdc:    parseFloat(amount),
        solanaAddress: solDest.trim(),
        gnosisTxHash,
      });
      setOrder(o);
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
          {order.status === 'fulfilled'
            ? 'Bridge complete! USDC arrived on Solana.'
            : 'Bridge failed or timed out.'}
        </p>
        {order.dstTxHash && (
          <p style={{ fontSize: 12, color: '#8b949e', marginTop: 8, wordBreak: 'break-all' }}>
            Solana tx: {order.dstTxHash}
          </p>
        )}
        <button style={styles.btn} onClick={() => { setStep('form'); setAmount(''); setSolDest(''); setOrder(null); }}>
          New Swap
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Gnosis USDC → Solana USDC</h3>

      {isMiniapp && gnosisAddress ? (
        <>
          <p style={styles.label}>Source (your Gnosis Safe)</p>
          <input style={{ ...styles.input, color: '#8b949e' }} value={gnosisAddress} readOnly />
        </>
      ) : (
        <p style={{ fontSize: 12, color: '#f0883e' }}>
          ⚠️ Running in standalone mode — you will need to send the tx manually.
        </p>
      )}

      <p style={styles.label}>Destination Solana wallet</p>
      <input
        style={styles.input}
        placeholder="G9PaCec..."
        value={solDest}
        onChange={e => setSolDest(e.target.value)}
        disabled={step !== 'form'}
      />

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
        <button
          style={styles.btn}
          disabled={!amount || parseFloat(amount) <= 0 || !solDest.trim()}
          onClick={handleQuote}
        >
          Get Quote
        </button>
      )}

      {step === 'quoted' && quote && (
        <>
          <div style={styles.quoteBox}>
            <Row label="You send" value={`$${quote.srcAmountUsdc} USDC (Gnosis)`} />
            <Row label="You receive" value={`~$${quote.dstAmountFormatted.toFixed(4)} USDC (Solana)`} />
            <Row label="Bridge fee" value={`$${quote.bridgeFeeUsdc.toFixed(4)}`} />
            <Row label="Est. time" value={`~${Math.round(quote.estimatedFillTimeMs / 1000)}s`} />
          </div>
          <QRAddress label="Send Gnosis USDC to this address" address={quote.depositAddress} network="gnosis" />
          <button style={styles.btn} onClick={handleBridge}>
            {isMiniapp ? 'Sign & Bridge' : 'Bridge (manual tx)'}
          </button>
          <button style={{ ...styles.btn, background: 'transparent', border: '1px solid #30363d' }} onClick={() => setStep('form')}>
            Back
          </button>
        </>
      )}

      {step === 'signing'  && <p style={styles.status}>🔏 Waiting for wallet signature…</p>}
      {step === 'awaiting' && <p style={styles.status}>⏳ Bridge in progress (~5–30s)…</p>}
      {error && <p style={{ color: '#f85149', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span>{value}</span>
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
    background: '#238636', border: 'none', borderRadius: 6, color: '#fff',
    cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '10px 0',
    marginTop: 4,
  },
  quoteBox: { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 12 },
  status:   { color: '#8b949e', fontSize: 14, textAlign: 'center' as const, marginTop: 8 },
};
