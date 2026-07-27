import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  label: string;
  address: string;
  network: 'solana' | 'gnosis';
}

export function QRAddress({ label, address, network }: Props) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  function copy() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const networkColor = network === 'solana' ? '#9945ff' : '#04795b';
  const networkLabel = network === 'solana' ? '◎ Solana' : '⬡ Gnosis';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 12, color: '#8b949e' }}>{label}</p>
        <span style={{
          fontSize: 10, fontWeight: 600, color: networkColor,
          background: networkColor + '22', border: '1px solid ' + networkColor + '44',
          borderRadius: 4, padding: '2px 6px',
        }}>{networkLabel}</span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px',
      }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 11, color: '#e6edf3',
          wordBreak: 'break-all', flex: 1, userSelect: 'text',
        }}>
          {address}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setShowQR(q => !q)} style={btnBase} title="Show QR">
            {showQR ? '✕' : 'QR'}
          </button>
          <button onClick={copy} style={{ ...btnBase, background: copied ? '#238636' : '#21262d', color: copied ? '#fff' : '#8b949e' }}>
            {copied ? '✓' : 'Copy'}
          </button>
        </div>
      </div>

      {showQR && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          background: '#fff', borderRadius: 10, padding: 16,
        }}>
          <QRCodeSVG value={address} size={180} level="M" />
          <p style={{ fontSize: 10, color: '#555', textAlign: 'center', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 180 }}>
            {address}
          </p>
        </div>
      )}
    </div>
  );
}

const btnBase: React.CSSProperties = {
  flexShrink: 0, background: '#21262d', border: '1px solid #30363d',
  borderRadius: 4, color: '#8b949e', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, padding: '4px 8px',
};
