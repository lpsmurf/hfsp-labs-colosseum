import { useState } from 'react'
import TopUp from './components/TopUp.jsx'
import Onboard from './components/Onboard.jsx'
import Redeem from './components/Redeem.jsx'

export default function App () {
  const [tab, setTab] = useState('topup')

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" />
          <span>Gnosis Card</span>
        </div>
        <a className="header-link" href="https://hfsp.xyz" target="_blank" rel="noreferrer">hfsp.xyz</a>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'topup' ? 'active' : ''}`}
          onClick={() => setTab('topup')}
        >
          Top Up
        </button>
        <button
          className={`tab ${tab === 'redeem' ? 'active' : ''}`}
          onClick={() => setTab('redeem')}
        >
          Redeem
        </button>
        <button
          className={`tab ${tab === 'onboard' ? 'active' : ''}`}
          onClick={() => setTab('onboard')}
        >
          Get a Card
          <span className="tab-badge">Preview</span>
        </button>
      </nav>

      <main className="main">
        {tab === 'topup' && <TopUp />}
        {tab === 'redeem' && <Redeem />}
        {tab === 'onboard' && <Onboard />}
      </main>

      <footer className="app-footer">
        <span>Funds bridge to Gnosis Chain via Relay.link · ~90s arrival</span>
        <span>Powered by x402 · USDC on Solana &amp; Base</span>
      </footer>
    </div>
  )
}
