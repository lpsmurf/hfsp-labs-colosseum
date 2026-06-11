import { useCirclesAccount } from './hooks/useCirclesAccount.js'
import Redeem from './components/Redeem.jsx'

export default function App() {
  const { address, inHost, isConnecting, error, connect } = useCirclesAccount()

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" />
          <span>Redeem with Circles</span>
        </div>
        <span className="header-sub">Gift cards &amp; top-ups via x402</span>
      </header>

      <main className="main">
        {!inHost ? (
          <div className="card center">
            <div className="icon-big">🔗</div>
            <h2>Open in Circles</h2>
            <p>This mini app must be opened inside the Circles host at app.gnosis.io.</p>
            <a className="btn primary" href="https://app.gnosis.io" target="_top" rel="noreferrer">
              Go to Circles
            </a>
          </div>
        ) : !address ? (
          <div className="card center">
            <div className="icon-big">🔐</div>
            <h2>Connect your Safe</h2>
            <p>Connect your Gnosis Safe to browse and redeem gift cards, mobile top-ups, and eSIMs — paid directly from your Safe wallet.</p>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary" onClick={connect} disabled={isConnecting}>
              {isConnecting ? 'Connecting…' : 'Connect Gnosis Safe'}
            </button>
          </div>
        ) : (
          <Redeem safeAddress={address} />
        )}
      </main>

      <footer className="app-footer">
        Powered by x402 · Cryptorefills · Gnosis Safe · <a href="https://hfsp.xyz" target="_blank" rel="noreferrer">hfsp.xyz</a>
      </footer>
    </div>
  )
}
