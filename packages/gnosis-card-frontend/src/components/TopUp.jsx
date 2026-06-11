import { useState, useEffect, useRef } from 'react'
import { CURRENCIES, SOURCE_CHAINS } from '../config.js'
import { getQuote, submitTopup, getOrderStatus, inspectSafe } from '../api.js'
import { connectSolana, sendUsdcSolana } from '../wallets/solana.js'
import { connectEvm, sendUsdcBase } from '../wallets/evm.js'

// Flow: form → quote → pay (wallet) → submit → poll → done
const STEPS = ['form', 'quote', 'paying', 'submitting', 'polling', 'done']

function shorten (addr) {
  if (!addr || addr.length < 12) return addr || ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function TopUp () {
  const [step, setStep] = useState('form')
  const [error, setError] = useState('')

  // form
  const [amount, setAmount] = useState('50')
  const [safeAddress, setSafeAddress] = useState('')
  const [currency, setCurrency] = useState('USDC')
  const [sourceChain, setSourceChain] = useState('solana')
  const [destType, setDestType] = useState('gnosispay') // 'gnosispay' | 'safe'

  // address inspection
  const [inspecting, setInspecting] = useState(false)
  const [inspection, setInspection] = useState(null)
  const inspectTimer = useRef(null)

  // wallet
  const [account, setAccount] = useState('')

  // results
  const [quote, setQuote] = useState(null)
  const [order, setOrder] = useState(null)
  const [orderStatus, setOrderStatus] = useState(null)

  const pollRef = useRef(null)
  useEffect(() => () => clearInterval(pollRef.current), [])

  const chainMeta = SOURCE_CHAINS.find(c => c.id === sourceChain)
  const validSafe = /^0x[0-9a-fA-F]{40}$/.test(safeAddress)
  const validAmount = Number(amount) >= 1 && Number(amount) <= 10_000

  // Debounced on-chain inspection of the destination address
  useEffect(() => {
    clearTimeout(inspectTimer.current)
    setInspection(null)
    if (!validSafe) { setInspecting(false); return }
    setInspecting(true)
    inspectTimer.current = setTimeout(async () => {
      try {
        const res = await inspectSafe(safeAddress)
        setInspection(res)
        // Auto-align the destination toggle with what we detected
        if (res.kind === 'gnosispay') setDestType('gnosispay')
        else if (res.kind === 'safe') setDestType('safe')
      } catch {
        setInspection({ ok: false })
      } finally {
        setInspecting(false)
      }
    }, 600)
    return () => clearTimeout(inspectTimer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAddress])

  function reset () {
    clearInterval(pollRef.current)
    setStep('form'); setError(''); setQuote(null); setOrder(null); setOrderStatus(null)
  }

  async function handleGetQuote (e) {
    e.preventDefault()
    setError('')
    if (!validAmount) return setError('Amount must be between 1 and 10,000 USDC')
    if (!validSafe) return setError('Enter a valid Gnosis Safe address (0x…)')
    try {
      const res = await getQuote({ amount: Number(amount), safeAddress, currency, sourceChain })
      setQuote(res)
      setStep('quote')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleConnect () {
    setError('')
    try {
      const addr = sourceChain === 'solana' ? await connectSolana() : await connectEvm()
      setAccount(addr)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePay () {
    setError('')
    setStep('paying')
    try {
      const payTo = quote.payment.payTo
      const amt = Number(amount)

      let signature
      if (sourceChain === 'solana') {
        signature = await sendUsdcSolana({ payTo, amount: amt })
      } else {
        signature = await sendUsdcBase({ payTo, amount: amt, from: account })
      }

      setStep('submitting')
      const res = await submitTopup({
        amount: amt, safeAddress, currency, sourceChain,
        signature, chain: sourceChain
      })
      setOrder(res)
      setStep('polling')
      startPolling(res.orderId)
    } catch (err) {
      setError(err.message || 'Payment failed')
      setStep('quote')
    }
  }

  function startPolling (orderId) {
    clearInterval(pollRef.current)
    let tries = 0
    pollRef.current = setInterval(async () => {
      tries++
      try {
        const s = await getOrderStatus(orderId)
        setOrderStatus(s)
        if (s.status === 'fulfilled' || s.status === 'failed') {
          clearInterval(pollRef.current)
          setStep('done')
        }
      } catch {
        // transient — keep polling
      }
      if (tries > 40) { // ~10 min cap
        clearInterval(pollRef.current)
        setStep('done')
      }
    }, 15_000)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card">
      <div className="card-head">
        <h1>Top up your Gnosis card</h1>
        <p>Pay USDC from {chainMeta.label}. Funds land on Gnosis Chain in ~90 seconds.</p>
      </div>

      <Stepper step={step} />

      {error && <div className="alert error">{error}</div>}

      {step === 'form' && (
        <form className="form" onSubmit={handleGetQuote}>
          <label className="field">
            <span>Source chain</span>
            <div className="seg">
              {SOURCE_CHAINS.map(c => (
                <button
                  type="button"
                  key={c.id}
                  className={`seg-btn ${sourceChain === c.id ? 'active' : ''}`}
                  onClick={() => { setSourceChain(c.id); setAccount('') }}
                >
                  {c.label}
                  <small>{c.wallet}</small>
                </button>
              ))}
            </div>
          </label>

          <label className="field">
            <span>Amount (USDC)</span>
            <input
              type="number" min="1" max="10000" step="1"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="50"
            />
          </label>

          <label className="field">
            <span>Receive as</span>
            <div className="seg">
              {CURRENCIES.map(c => (
                <button
                  type="button" key={c}
                  className={`seg-btn ${currency === c ? 'active' : ''}`}
                  onClick={() => setCurrency(c)}
                >{c}</button>
              ))}
            </div>
          </label>

          <label className="field">
            <span>Deposit to</span>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn ${destType === 'gnosispay' ? 'active' : ''}`}
                onClick={() => setDestType('gnosispay')}
              >
                Gnosis Pay card
                <small>spendable balance</small>
              </button>
              <button
                type="button"
                className={`seg-btn ${destType === 'safe' ? 'active' : ''}`}
                onClick={() => setDestType('safe')}
              >
                Standard Safe
                <small>self-custody</small>
              </button>
            </div>
          </label>

          <label className="field">
            <span>{destType === 'gnosispay' ? 'Your Gnosis Pay card address' : 'Your Gnosis Safe address'}</span>
            <input
              type="text" value={safeAddress}
              onChange={e => setSafeAddress(e.target.value.trim())}
              placeholder="0x…" spellCheck={false}
            />
            <AddressInsight inspecting={inspecting} inspection={inspection} destType={destType} />
          </label>

          <button className="btn primary" type="submit" disabled={!validAmount || !validSafe}>
            Get quote
          </button>
        </form>
      )}

      {step === 'quote' && quote && (
        <div className="quote">
          <div className="quote-rows">
            <Row k="You pay" v={quote.quote.youPay} />
            <Row k="You receive" v={quote.quote.youReceive} strong />
            <Row k="Bridge fee" v={quote.quote.bridgeFee} muted />
            <Row k="Service fee" v={quote.quote.serviceFee} muted />
            <Row k="Estimated time" v={quote.quote.estimatedTime} muted />
            <Row k="Safe" v={shorten(quote.quote.safeAddress)} muted />
          </div>

          <div className="pay-box">
            {!account ? (
              <button className="btn wallet" onClick={handleConnect}>
                Connect {chainMeta.wallet}
              </button>
            ) : (
              <>
                <div className="connected">
                  <span className="dot ok" /> {chainMeta.wallet} · {shorten(account)}
                </div>
                <button className="btn primary" onClick={handlePay}>
                  Pay {amount} USDC →
                </button>
              </>
            )}
          </div>

          <button className="btn ghost" onClick={reset}>← Edit details</button>
        </div>
      )}

      {(step === 'paying' || step === 'submitting') && (
        <div className="working">
          <div className="spinner" />
          <p>{step === 'paying'
            ? `Confirm the ${amount} USDC payment in ${chainMeta.wallet}…`
            : 'Verifying payment and submitting bridge order…'}</p>
        </div>
      )}

      {step === 'polling' && (
        <div className="working">
          <div className="spinner" />
          <p>Bridging to your Safe on Gnosis Chain…</p>
          {order?.srcTxHash && (
            <p className="muted small">Source tx: {shorten(order.srcTxHash)}</p>
          )}
          <p className="muted small">{orderStatus?.message || 'This usually takes 1–3 minutes.'}</p>
        </div>
      )}

      {step === 'done' && (
        <div className="done">
          {orderStatus?.status === 'fulfilled' ? (
            <>
              <div className="check">✓</div>
              <h2>Funds arrived</h2>
              <p>{Number(amount)} {currency} is now in your Gnosis Safe.</p>
            </>
          ) : orderStatus?.status === 'failed' ? (
            <>
              <div className="check fail">✕</div>
              <h2>Bridge failed</h2>
              <p>{orderStatus?.message || 'Contact support@'} — your funds are safe.</p>
            </>
          ) : (
            <>
              <div className="check">⋯</div>
              <h2>Still bridging</h2>
              <p>Taking longer than usual. Check your Safe shortly, or track the order.</p>
            </>
          )}
          {orderStatus?.dstTxHash && (
            <a className="btn ghost" target="_blank" rel="noreferrer"
               href={`https://gnosisscan.io/tx/${orderStatus.dstTxHash}`}>
              View on Gnosisscan
            </a>
          )}
          <button className="btn primary" onClick={reset}>Top up again</button>
        </div>
      )}
    </div>
  )
}

function Stepper ({ step }) {
  const idx = STEPS.indexOf(step)
  const labels = ['Details', 'Quote', 'Pay', 'Bridge', 'Done']
  // map the 6 internal steps onto 5 visible dots
  const visible = step === 'submitting' ? 2 : idx > 2 ? idx - 1 : idx
  return (
    <div className="stepper">
      {labels.map((l, i) => (
        <div key={l} className={`step ${i <= visible ? 'reached' : ''} ${i === visible ? 'current' : ''}`}>
          <span className="step-dot">{i + 1}</span>
          <span className="step-label">{l}</span>
        </div>
      ))}
    </div>
  )
}

function Row ({ k, v, strong, muted }) {
  return (
    <div className={`qrow ${strong ? 'strong' : ''} ${muted ? 'muted' : ''}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}

// On-chain read-out of the pasted destination address.
function AddressInsight ({ inspecting, inspection, destType }) {
  if (inspecting) {
    return <div className="insight loading"><span className="spinner small" /> Reading Gnosis Chain…</div>
  }
  if (!inspection) return null
  if (inspection.ok === false) {
    return <div className="insight warn">Couldn’t read this address on Gnosis Chain.</div>
  }

  const { kind, safeVersion, balances } = inspection
  const held = ['USDC', 'EURe', 'GBPe']
    .map(s => ({ s, v: balances?.[s]?.formatted ?? 0 }))
    .filter(x => x.v > 0)
  const heldStr = held.length
    ? held.map(x => `${x.v} ${x.s}`).join(' · ')
    : 'no Gnosis tokens yet'

  if (kind === 'gnosispay') {
    return (
      <div className="insight ok">
        <strong>✓ Gnosis Pay account</strong> detected (Safe {safeVersion}). Holds {heldStr}.
      </div>
    )
  }
  if (kind === 'safe') {
    return (
      <div className={`insight ${destType === 'gnosispay' ? 'warn' : 'ok'}`}>
        <strong>✓ Gnosis Safe</strong> (v{safeVersion}). Holds {heldStr}.
        {destType === 'gnosispay' && <> No card tokens here yet — confirm this is your Pay card.</>}
      </div>
    )
  }
  // wallet / EOA
  return (
    <div className="insight warn">
      <strong>⚠ Looks like a regular wallet</strong>, not a Safe. Top-ups should go to a Gnosis
      Safe / Pay card address — double-check before paying. Holds {heldStr}.
    </div>
  )
}
