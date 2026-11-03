import { useState, useEffect } from 'react'
import { sendTransactions } from '@aboutcircles/miniapp-sdk'
import { storeBrands, storeCatalog, circlesQuote, circlesFulfill, circlesStatus } from '../api.js'

// Gnosis Chain USDC (native Circle USDC used by Gnosis Pay)
const GNOSIS_USDC = '0x2a22f9c3b484c3629090feed35f17ff8f88f76f0'

const COUNTRIES = [
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'es', label: 'Spain' },
  { code: 'it', label: 'Italy' },
]

// ERC-20 transfer(address,uint256) calldata
function encodeTransfer(to, amountUnits) {
  const sel  = 'a9059cbb'
  const addr = to.slice(2).toLowerCase().padStart(64, '0')
  const amt  = BigInt(amountUnits).toString(16).padStart(64, '0')
  return `0x${sel}${addr}${amt}`
}

function shorten(s) { return s && s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s }

function buildItem(product, email) {
  return {
    product_id: product.id,
    beneficiary_account: email,
    ...(product.value ? { product_value: product.value } : {}),
  }
}

export default function Redeem({ safeAddress }) {
  const [country, setCountry]       = useState('us')
  const [brands, setBrands]         = useState(null)
  const [brandsLoading, setBLoading]= useState(false)
  const [filter, setFilter]         = useState('')
  const [error, setError]           = useState('')

  const [brand, setBrand]     = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [product, setProduct] = useState(null)

  const [view, setView] = useState('browse')  // browse | product | checkout | polling | done

  // checkout state
  const [email, setEmail] = useState('')
  const [quote, setQuote] = useState(null)    // { orderId, payTo, amountUnits, amountUsd, tokenAddress }
  const [busy, setBusy]   = useState('')      // '' | 'quoting' | 'waiting' | 'verifying'
  const [result, setResult] = useState(null)

  // ── Load brands ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setBLoading(true); setError(''); setBrands(null)
    storeBrands(country)
      .then(data => { if (!cancelled) setBrands(normalizeBrands(data)) })
      .catch(err  => { if (!cancelled) setError(err.message) })
      .finally(()  => { if (!cancelled) setBLoading(false) })
    return () => { cancelled = true }
  }, [country])

  function resetToBrowse() {
    setBrand(null); setCatalog(null); setProduct(null)
    setQuote(null); setResult(null); setEmail(''); setBusy(''); setError('')
    setView('browse')
  }

  async function openBrand(b) {
    setBrand(b); setError(''); setCatalog(null); setProduct(null); setView('product')
    try {
      setCatalog(normalizeProducts(await storeCatalog(country, b.name)))
    } catch (err) {
      setError(err.message)
    }
  }

  function chooseProduct(p) {
    setProduct(p); setQuote(null); setResult(null); setError(''); setView('checkout')
  }

  // ── Quote: get price from backend (calls x402-store phase 1) ─────────────
  async function getQuote() {
    setError('')
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setError('Enter a valid delivery email.'); return }
    setBusy('quoting')
    try {
      const items = [buildItem(product, email)]
      const q = await circlesQuote({ email, items })
      setQuote(q)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // ── Pay: Safe sends USDC on Gnosis Chain, then backend fulfills ───────────
  async function payWithSafe() {
    setError('')
    setBusy('waiting')
    let txHashes
    try {
      // Ask the Circles host to send the Safe tx: ERC-20 USDC transfer to backend wallet
      txHashes = await sendTransactions([{
        to:    GNOSIS_USDC,
        value: '0',
        data:  encodeTransfer(quote.payTo, quote.amountUnits),
      }])
    } catch (err) {
      setError(err.message || 'Transaction rejected.')
      setBusy('')
      return
    }

    const txHash = txHashes?.[0]
    if (!txHash) { setError('No transaction hash returned.'); setBusy(''); return }

    setBusy('verifying')
    setView('polling')

    // Notify backend — it will verify the Gnosis tx and call x402-store internally
    try {
      await circlesFulfill({ orderId: quote.orderId, txHash })
    } catch (err) {
      if (err.status !== 202) {
        setError(err.message); setBusy(''); setView('checkout'); return
      }
    }

    // Poll for result
    await pollForResult(quote.orderId)
  }

  async function pollForResult(orderId) {
    let tries = 0
    const poll = async () => {
      tries++
      try {
        const s = await circlesStatus(orderId)
        if (s.status === 'fulfilled') {
          setResult(s.data); setView('done'); setBusy(''); return
        }
        if (s.status === 'failed') {
          setError(s.error || 'Fulfillment failed.'); setView('checkout'); setBusy(''); return
        }
      } catch { /* transient */ }
      if (tries > 20) { setError('Timed out waiting for fulfillment.'); setView('checkout'); setBusy(''); return }
      setTimeout(poll, 6_000)
    }
    poll()
  }

  const filteredBrands = (brands || []).filter(b =>
    !filter || b.name.toLowerCase().includes(filter.toLowerCase()))

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="card-head">
        <h1>Redeem your balance</h1>
        <p>Gift cards, mobile top-ups &amp; eSIMs — paid from your Gnosis Safe with USDC.</p>
        <div className="safe-badge">
          <span className="dot ok" /> Safe: {shorten(safeAddress)}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {/* ── Browse ── */}
      {view === 'browse' && (
        <>
          <div className="redeem-controls">
            <select className="select" value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <input className="redeem-search" placeholder="Search brands…"
              value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          {brandsLoading && <div className="working"><div className="spinner" /><p>Loading brands…</p></div>}
          {!brandsLoading && brands && (
            <div className="brand-grid">
              {filteredBrands.slice(0, 60).map(b => (
                <button key={b.name} className="brand-tile" onClick={() => openBrand(b)}>
                  {b.logo
                    ? <img src={b.logo} alt={b.name} loading="lazy" />
                    : <span className="brand-initial">{b.name.charAt(0)}</span>}
                  <span className="brand-name">{b.name}</span>
                </button>
              ))}
              {filteredBrands.length === 0 && <p className="muted">No brands match "{filter}".</p>}
            </div>
          )}
        </>
      )}

      {/* ── Products ── */}
      {view === 'product' && brand && (
        <>
          <button className="btn ghost back-inline" onClick={resetToBrowse}>← All brands</button>
          <div className="brand-head">
            {brand.logo && <img src={brand.logo} alt={brand.name} className="brand-head-logo" />}
            <h2>{brand.name}</h2>
          </div>
          {!catalog && <div className="working"><div className="spinner" /><p>Loading products…</p></div>}
          {catalog && (
            <div className="product-list">
              {catalog.map(p => (
                <button key={p.id} className="product-row" onClick={() => chooseProduct(p)}>
                  <span className="product-name">{p.name}</span>
                  <span className="product-price">{p.priceLabel}</span>
                </button>
              ))}
              {catalog.length === 0 && <p className="muted">No products available.</p>}
            </div>
          )}
        </>
      )}

      {/* ── Checkout ── */}
      {view === 'checkout' && product && (
        <>
          <button className="btn ghost back-inline" onClick={() => setView('product')}>← Back</button>
          <div className="checkout">
            <div className="checkout-summary">
              <span>{brand.name}</span>
              <strong>{product.name}</strong>
              <span className="muted">{product.priceLabel}</span>
            </div>

            {!quote ? (
              <>
                <label className="field">
                  <span>Delivery email</span>
                  <input type="email" value={email} placeholder="you@email.com"
                    onChange={e => setEmail(e.target.value.trim())} />
                </label>
                <button className="btn primary" onClick={getQuote} disabled={busy === 'quoting'}>
                  {busy === 'quoting' ? 'Getting price…' : 'Get price'}
                </button>
              </>
            ) : (
              <>
                <div className="quote-rows">
                  <Row k="Item"      v={product.name} />
                  <Row k="Price"     v={`$${Number(quote.amountUsd).toFixed(2)} USDC`} strong />
                  <Row k="Pay from"  v={`Gnosis Safe · ${shorten(safeAddress)}`} muted />
                  <Row k="Delivery"  v={email} muted />
                  <Row k="Network"   v="Gnosis Chain" muted />
                </div>
                <div className="x402-note">
                  Your Safe will send <strong>${Number(quote.amountUsd).toFixed(2)} USDC</strong> on Gnosis Chain.
                  The x402 bridge converts it to a Cryptorefills redemption instantly.
                </div>
                <button className="btn primary" onClick={payWithSafe} disabled={!!busy}>
                  {busy === 'waiting' ? 'Confirm in Circles…' : `Pay $${Number(quote.amountUsd).toFixed(2)} USDC →`}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Polling ── */}
      {view === 'polling' && (
        <div className="working">
          <div className="spinner large" />
          <h3>Processing your order</h3>
          <p>Your Safe transaction is being confirmed on Gnosis Chain, then the gift card is redeemed via x402.</p>
          <p className="muted small">This usually takes 15–60 seconds.</p>
        </div>
      )}

      {/* ── Done ── */}
      {view === 'done' && (
        <div className="done">
          <div className="check">✓</div>
          <h2>Redeemed!</h2>
          <p>Your gift card has been redeemed. Delivery details were sent to {email}.</p>
          {result?.order_id && <p className="muted small">Order: {result.order_id}</p>}
          <RedeemResult result={result} />
          <button className="btn primary" onClick={resetToBrowse}>Redeem something else</button>
        </div>
      )}
    </div>
  )
}

function Row({ k, v, strong, muted }) {
  return (
    <div className={`qrow ${strong ? 'strong' : ''} ${muted ? 'muted' : ''}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  )
}

function RedeemResult({ result }) {
  const cards = result?.cards || result?.codes || result?.vouchers
  if (!Array.isArray(cards) || cards.length === 0) return null
  return (
    <div className="redeem-codes">
      {cards.map((c, i) => (
        <div key={i} className="code-box">
          {c.code && <div><span className="muted small">Code</span><code>{c.code}</code></div>}
          {c.pin  && <div><span className="muted small">PIN</span><code>{c.pin}</code></div>}
          {c.url  && <a href={c.url} target="_blank" rel="noreferrer" className="btn ghost">Open</a>}
        </div>
      ))}
    </div>
  )
}

// ── Normalizers ───────────────────────────────────────────────────────────
function normalizeBrands(data) {
  const list = data?.brands || data?.data || data?.results || (Array.isArray(data) ? data : [])
  return list.map(b => ({
    name: b.brand_name || b.name || b.title || String(b),
    logo: b.logo_url || b.logo || b.image || null,
  })).filter(b => b.name)
}

function normalizeProducts(data) {
  const list = data?.products || data?.catalog || data?.data || data?.results || (Array.isArray(data) ? data : [])
  return list.map(p => {
    const id = p.product_id || p.id || p.sku
    const priceLabel = p.price_usdc
      ? `$${Number(p.price_usdc).toFixed(2)} USDC`
      : (p.face_value_usd ? `$${p.face_value_usd}` : 'Variable')
    return {
      id,
      name: p.product_name || p.name || p.title || 'Gift card',
      value: p.is_range ? undefined : (p.value ?? p.face_value_usd ?? undefined),
      priceLabel,
    }
  }).filter(p => p.id)
}
