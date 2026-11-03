import { useState } from 'react';

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>{label}</p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#0d1117', border: '1px solid #30363d',
        borderRadius: 6, padding: '8px 10px',
      }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 12, color: '#e6edf3',
          wordBreak: 'break-all', flex: 1, userSelect: 'text',
        }}>
          {value}
        </span>
        <button
          onClick={copy}
          style={{
            flexShrink: 0, background: copied ? '#238636' : '#21262d',
            border: '1px solid #30363d', borderRadius: 4,
            color: copied ? '#fff' : '#8b949e', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, padding: '4px 8px',
            transition: 'background 0.2s',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
