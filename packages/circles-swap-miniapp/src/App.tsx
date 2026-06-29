import { useState } from 'react';
import { useCirclesWallet } from './hooks/useCirclesWallet';
import { SwapSolToGnosis } from './components/SwapSolToGnosis';
import { SwapGnosisToSol } from './components/SwapGnosisToSol';

type Direction = 'sol_to_gnosis' | 'gnosis_to_sol';

export default function App() {
  const { gnosisAddress, isMiniapp } = useCirclesWallet();
  const [dir, setDir] = useState<Direction>('sol_to_gnosis');

  const canSwapSolToGnosis = !!gnosisAddress || !isMiniapp;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Clawdrop Bridge</div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>SOL ↔ Gnosis · Powered by Relay.link</div>
          </div>
          {isMiniapp && gnosisAddress && (
            <div style={{
              marginLeft: 'auto', fontSize: 11, color: '#3fb950',
              background: '#0d2816', border: '1px solid #238636', borderRadius: 4, padding: '2px 6px',
            }}>
              🟢 Safe connected
            </div>
          )}
        </div>

        {/* Direction toggle */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: '#0d1117', borderRadius: 8, padding: 4, gap: 4,
        }}>
          {(['sol_to_gnosis', 'gnosis_to_sol'] as Direction[]).map(d => (
            <button
              key={d}
              onClick={() => setDir(d)}
              style={{
                background: dir === d ? '#1f6feb' : 'transparent',
                border: 'none', borderRadius: 6, color: dir === d ? '#fff' : '#8b949e',
                cursor: 'pointer', fontSize: 13, fontWeight: dir === d ? 600 : 400,
                padding: '8px 0',
              }}
            >
              {d === 'sol_to_gnosis' ? '◎ SOL → Gnosis' : 'Gnosis → SOL ◎'}
            </button>
          ))}
        </div>

        {/* Swap panel */}
        {dir === 'sol_to_gnosis' ? (
          canSwapSolToGnosis ? (
            <SwapSolToGnosis gnosisAddress={gnosisAddress ?? ''} isMiniapp={isMiniapp} />
          ) : (
            <p style={{ color: '#8b949e', fontSize: 13, textAlign: 'center' }}>
              Connect your Gnosis Safe to swap.
            </p>
          )
        ) : (
          <SwapGnosisToSol gnosisAddress={gnosisAddress} isMiniapp={isMiniapp} />
        )}

        {/* Footer */}
        <p style={{ fontSize: 11, color: '#484f58', textAlign: 'center' }}>
          0.5% service fee · Bridge via Relay.link · ~5s fills
        </p>
      </div>
    </div>
  );
}
