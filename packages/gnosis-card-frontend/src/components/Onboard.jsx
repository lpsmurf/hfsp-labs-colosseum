import { useState } from 'react'

// ── MOCKUP ONLY ───────────────────────────────────────────────────────────────
// Visual prototype of the managed onboarding flow for future development.
// No wallet / SIWE / KYC / payment logic is wired — every button just advances
// the local step so the screens can be reviewed. The real flow maps to:
//   GET  /api/card/onboard/nonce
//   POST /api/card/onboard/session   (SIWE)
//   POST /api/card/onboard           (x402 fee)
//   POST /api/card/onboard/:id/terms
//   GET  /api/card/onboard/:id/kyc   (Sumsub widget)
//   POST /api/card/onboard/:id/card

const STAGES = [
  { id: 'connect', title: 'Connect wallet', desc: 'Sign in with your EVM wallet (SIWE).' },
  { id: 'pay',     title: 'Pay setup fee',  desc: 'One-time onboarding fee via x402.' },
  { id: 'terms',   title: 'Accept terms',   desc: 'Gnosis Pay Terms & Conditions.' },
  { id: 'kyc',     title: 'Verify identity', desc: 'Government ID check via Sumsub.' },
  { id: 'safe',    title: 'Deploy Safe',    desc: 'Your self-custody Safe is created on Gnosis Chain.' },
  { id: 'card',    title: 'Create card',    desc: 'Virtual Visa card, ready for 80M+ merchants.' }
]

export default function Onboard () {
  const [stage, setStage] = useState(0)
  const current = STAGES[stage]
  const done = stage >= STAGES.length

  return (
    <div className="card">
      <div className="preview-banner">
        Preview — visual prototype. Onboarding is not yet live.
      </div>

      <div className="card-head">
        <h1>Get a Gnosis Pay card</h1>
        <p>Managed setup: wallet sign-in, KYC, self-custody Safe, and a virtual Visa card.</p>
      </div>

      {!done ? (
        <>
          <div className="onboard-track">
            {STAGES.map((s, i) => (
              <div key={s.id} className={`otrack-item ${i < stage ? 'done' : ''} ${i === stage ? 'current' : ''}`}>
                <span className="otrack-dot">{i < stage ? '✓' : i + 1}</span>
                <span className="otrack-label">{s.title}</span>
              </div>
            ))}
          </div>

          <div className="onboard-stage">
            <h2>{current.title}</h2>
            <p className="muted">{current.desc}</p>

            <MockStageBody stageId={current.id} />

            <div className="onboard-actions">
              {stage > 0 && (
                <button className="btn ghost" onClick={() => setStage(s => s - 1)}>← Back</button>
              )}
              <button className="btn primary" onClick={() => setStage(s => s + 1)}>
                {stage === STAGES.length - 1 ? 'Finish' : 'Continue'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="done">
          <div className="check">✓</div>
          <h2>Card ready</h2>
          <p>Your virtual card is active. Fund your Safe via the Top Up tab and start spending.</p>
          <button className="btn primary" onClick={() => setStage(0)}>Restart preview</button>
        </div>
      )}
    </div>
  )
}

function MockStageBody ({ stageId }) {
  switch (stageId) {
    case 'connect':
      return (
        <div className="mock-box">
          <button className="btn wallet" disabled>Sign in with MetaMask</button>
          <button className="btn wallet" disabled>Sign in with Coinbase Wallet</button>
        </div>
      )
    case 'pay':
      return (
        <div className="mock-box">
          <div className="qrow strong"><span>Setup fee</span><span>$5.00 USDC</span></div>
          <div className="qrow muted"><span>Network</span><span>Solana / Base</span></div>
          <button className="btn primary" disabled>Pay with x402</button>
        </div>
      )
    case 'terms':
      return (
        <div className="mock-box terms">
          <label className="check-row"><input type="checkbox" disabled /> I accept the Gnosis Pay Terms &amp; Conditions</label>
          <label className="check-row"><input type="checkbox" disabled /> I accept the Privacy Policy</label>
        </div>
      )
    case 'kyc':
      return (
        <div className="mock-box kyc">
          <div className="kyc-frame">
            <div className="kyc-icon">🪪</div>
            <p>Sumsub identity verification widget</p>
            <small className="muted">@sumsub/websdk-react renders here</small>
          </div>
        </div>
      )
    case 'safe':
      return (
        <div className="mock-box">
          <div className="spinner small" />
          <p className="muted">Deploying your Safe on Gnosis Chain…</p>
        </div>
      )
    case 'card':
      return (
        <div className="mock-box">
          <div className="card-visual">
            <span className="cv-brand">Gnosis Pay</span>
            <span className="cv-number">•••• •••• •••• 4242</span>
            <span className="cv-foot">VIRTUAL · VISA</span>
          </div>
        </div>
      )
    default:
      return null
  }
}
