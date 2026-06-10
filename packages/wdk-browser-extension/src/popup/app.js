// Popup UI — multi-chain state machine
// All wallet logic lives in background/service-worker.js

// ── Messaging ────────────────────────────────────────────────────────────────

function send (type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
      if (response.error) return reject(new Error(response.error))
      resolve(response.data)
    })
  })
}

// ── Screen router ─────────────────────────────────────────────────────────────

function showScreen (id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'))
  const el = document.getElementById(`screen-${id}`)
  if (el) el.classList.add('active')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setError (id, msg) {
  const el = document.getElementById(id)
  if (el) el.textContent = msg || ''
}

function setSuccess (id, msg) {
  const el = document.getElementById(id)
  if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none' }
}

function setDisabled (btnId, disabled) {
  const btn = document.getElementById(btnId)
  if (btn) btn.disabled = disabled
}

function truncate (addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`
}

// ── Network metadata (mirrors service worker NETWORKS) ─────────────────────

const NET_META = {
  solana:   { name: 'Solana',   symbol: 'SOL', hasUsdt: true,  type: 'solana' },
  ethereum: { name: 'Ethereum', symbol: 'ETH', hasUsdt: true,  type: 'evm'    },
  polygon:  { name: 'Polygon',  symbol: 'POL', hasUsdt: true,  type: 'evm'    },
  arbitrum: { name: 'Arbitrum', symbol: 'ETH', hasUsdt: true,  type: 'evm'    },
  plasma:   { name: 'Plasma',   symbol: 'ETH', hasUsdt: true,  type: 'evm'    },
  bitcoin:  { name: 'Bitcoin',  symbol: 'BTC', hasUsdt: false, type: 'btc'    },
  spark:    { name: 'Lightning',symbol: 'BTC', hasUsdt: false, type: 'spark'  }
}

// ── State ─────────────────────────────────────────────────────────────────────

let state = {
  address: null,
  networkId: 'solana',
  native: '0',
  usdt: '0',
  sendAsset: 'usdt' // 'usdt' | 'native'
}

// ── Network pill management ───────────────────────────────────────────────────

function updatePills (activeId) {
  document.querySelectorAll('.net-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.network === activeId)
  })
}

function applyNetworkToUI (networkId) {
  const meta = NET_META[networkId] || NET_META.solana
  state.networkId = networkId

  document.getElementById('home-network-name').textContent = meta.name
  document.getElementById('settings-network-name').textContent = meta.name
  updatePills(networkId)

  // Send screen
  document.getElementById('send-title').textContent = `Send on ${meta.name}`
  document.getElementById('asset-native').textContent = meta.symbol

  // Show/hide USDt asset pill on send screen
  const assetRow = document.getElementById('send-asset-row')
  assetRow.style.display = meta.hasUsdt ? 'block' : 'none'
  if (!meta.hasUsdt) {
    state.sendAsset = 'native'
    document.querySelectorAll('.asset-pill').forEach(p => p.classList.remove('active'))
    document.getElementById('asset-native').classList.add('active')
  } else {
    state.sendAsset = 'usdt'
    document.querySelectorAll('.asset-pill').forEach(p => p.classList.remove('active'))
    document.getElementById('asset-usdt').classList.add('active')
  }
  updateSendAmountLabel()

  // Receive screen
  document.getElementById('receive-title').textContent = `Receive — ${meta.name}`
  document.getElementById('receive-warning').textContent =
    `Only send ${meta.symbol}${meta.hasUsdt ? ' or USDt' : ''} on ${meta.name} to this address.`

  // Balance display
  const usdtEl = document.getElementById('balance-usdt')
  usdtEl.style.display = meta.hasUsdt ? 'block' : 'none'
}

function updateSendAmountLabel () {
  const meta = NET_META[state.networkId] || NET_META.solana
  const label = state.sendAsset === 'usdt' ? 'Amount (USDt)' : `Amount (${meta.symbol})`
  document.getElementById('send-amount-label').textContent = label
}

// Network pill click
document.querySelectorAll('.net-pill').forEach((pill) => {
  pill.addEventListener('click', async () => {
    const networkId = pill.dataset.network
    if (networkId === state.networkId) return
    pill.disabled = true
    try {
      const { address } = await send('NETWORK_SET', { networkId })
      state.address = address
      applyNetworkToUI(networkId)
      document.getElementById('home-address').textContent = truncate(address)
      document.getElementById('balance-native').textContent = '—'
      document.getElementById('balance-usdt').textContent = '— USDt'
      document.getElementById('status-text').textContent = 'Fetching balances…'
      loadHome()
    } catch (err) {
      document.getElementById('status-text').textContent = err.message
    } finally {
      pill.disabled = false
    }
  })
})

// Asset pills on send screen
document.querySelectorAll('.asset-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    state.sendAsset = pill.dataset.asset
    document.querySelectorAll('.asset-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    updateSendAmountLabel()
  })
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot () {
  try {
    const { initialized, unlocked, address, networkId } = await send('WALLET_STATE')
    applyNetworkToUI(networkId || 'solana')
    if (!initialized) {
      showScreen('setup')
    } else if (unlocked) {
      state.address = address
      showScreen('home')
      loadHome()
    } else {
      showScreen('unlock')
    }
  } catch (err) {
    console.error('Boot error:', err)
    showScreen('setup')
  }
}

// ── Setup screen ──────────────────────────────────────────────────────────────

document.getElementById('btn-create-new').addEventListener('click', () => {
  document.getElementById('setup-main').style.display = 'none'
  document.getElementById('setup-create').style.display = 'block'
  document.getElementById('create-password').focus()
})

document.getElementById('btn-import-wallet').addEventListener('click', () => {
  document.getElementById('setup-main').style.display = 'none'
  document.getElementById('setup-import').style.display = 'block'
  document.getElementById('import-mnemonic').focus()
})

document.getElementById('btn-import-back').addEventListener('click', () => {
  document.getElementById('setup-import').style.display = 'none'
  document.getElementById('setup-main').style.display = 'block'
})

document.getElementById('btn-create-confirm').addEventListener('click', async () => {
  const pw = document.getElementById('create-password').value
  const confirm = document.getElementById('create-confirm').value
  setError('create-error', '')
  if (pw.length < 8) return setError('create-error', 'Password must be at least 8 characters')
  if (pw !== confirm) return setError('create-error', 'Passwords do not match')
  setDisabled('btn-create-confirm', true)
  try {
    const { mnemonic } = await send('WALLET_CREATE', { password: pw })
    renderMnemonic(mnemonic)
    document.getElementById('setup-create').style.display = 'none'
    document.getElementById('setup-mnemonic').style.display = 'block'
  } catch (err) {
    setError('create-error', err.message)
  } finally {
    setDisabled('btn-create-confirm', false)
  }
})

function renderMnemonic (mnemonic) {
  const words = mnemonic.trim().split(/\s+/)
  const grid = document.getElementById('mnemonic-grid')
  grid.innerHTML = words.map((w, i) =>
    `<div class="mnemonic-word"><span>${i + 1}</span><span>${w}</span></div>`
  ).join('')
}

document.getElementById('btn-mnemonic-done').addEventListener('click', async () => {
  const { address, networkId } = await send('WALLET_STATE')
  state.address = address
  applyNetworkToUI(networkId || 'solana')
  showScreen('home')
  loadHome()
})

document.getElementById('btn-import-confirm').addEventListener('click', async () => {
  const mnemonic = document.getElementById('import-mnemonic').value.trim()
  const pw = document.getElementById('import-password').value
  const confirm = document.getElementById('import-confirm').value
  setError('import-error', '')
  if (!mnemonic) return setError('import-error', 'Enter your seed phrase')
  if (pw.length < 8) return setError('import-error', 'Password must be at least 8 characters')
  if (pw !== confirm) return setError('import-error', 'Passwords do not match')
  setDisabled('btn-import-confirm', true)
  try {
    const { address } = await send('WALLET_IMPORT', { mnemonic, password: pw })
    state.address = address
    showScreen('home')
    loadHome()
  } catch (err) {
    setError('import-error', err.message)
  } finally {
    setDisabled('btn-import-confirm', false)
  }
})

// ── Unlock screen ─────────────────────────────────────────────────────────────

document.getElementById('btn-unlock').addEventListener('click', async () => {
  const pw = document.getElementById('unlock-password').value
  setError('unlock-error', '')
  if (!pw) return setError('unlock-error', 'Enter your password')
  setDisabled('btn-unlock', true)
  try {
    const { address, networkId } = await send('WALLET_UNLOCK', { password: pw })
    state.address = address
    applyNetworkToUI(networkId || 'solana')
    showScreen('home')
    loadHome()
  } catch (err) {
    setError('unlock-error', err.message)
  } finally {
    setDisabled('btn-unlock', false)
  }
})

document.getElementById('unlock-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-unlock').click()
})

document.getElementById('btn-unlock-reset').addEventListener('click', () => {
  if (confirm('This will permanently delete your wallet. Are you sure you backed up your seed phrase?')) {
    chrome.storage.local.clear(() => { showScreen('setup'); resetSetupForms() })
  }
})

// ── Home screen ───────────────────────────────────────────────────────────────

async function loadHome () {
  const dot = document.getElementById('status-dot')
  const statusText = document.getElementById('status-text')
  const meta = NET_META[state.networkId] || NET_META.solana

  document.getElementById('home-address').textContent = truncate(state.address)
  statusText.textContent = 'Fetching balances…'
  dot.classList.remove('offline')

  try {
    const { native, nativeSymbol, usdt } = await send('WALLET_BALANCE')
    state.native = native
    state.usdt = usdt || '0'

    const nativeFmt = parseFloat(native).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })
    document.getElementById('balance-native').textContent = `${nativeFmt} ${nativeSymbol}`

    if (meta.hasUsdt && usdt !== null) {
      const usdtFmt = parseFloat(usdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
      document.getElementById('balance-usdt').textContent = `${usdtFmt} USDt`
      document.getElementById('balance-usdt').style.display = 'block'
    } else {
      document.getElementById('balance-usdt').style.display = 'none'
    }

    statusText.textContent = `${meta.name} · Updated`
    dot.classList.remove('offline')
  } catch (err) {
    statusText.textContent = err.message
    dot.classList.add('offline')
  }
}

document.getElementById('btn-lock').addEventListener('click', async () => {
  await send('WALLET_LOCK')
  state = { address: null, networkId: state.networkId, native: '0', usdt: '0', sendAsset: 'usdt' }
  showScreen('unlock')
  document.getElementById('unlock-password').value = ''
})

document.getElementById('btn-go-send').addEventListener('click', () => {
  setError('send-error', '')
  setSuccess('send-success', '')
  document.getElementById('send-to').value = ''
  document.getElementById('send-amount').value = ''
  showScreen('send')
})

document.getElementById('btn-go-receive').addEventListener('click', () => {
  document.getElementById('receive-address').textContent = state.address || ''
  showScreen('receive')
})

document.getElementById('btn-settings').addEventListener('click', async () => {
  const meta = NET_META[state.networkId] || NET_META.solana
  document.getElementById('settings-network-name').textContent = meta.name
  const key = 'wdk_rpc_' + state.networkId
  const data = await chrome.storage.local.get([key])
  document.getElementById('settings-rpc').value = data[key] || ''
  showScreen('settings')
})

// ── Send screen ───────────────────────────────────────────────────────────────

document.getElementById('btn-send-back').addEventListener('click', () => showScreen('home'))

document.getElementById('btn-send-max').addEventListener('click', () => {
  document.getElementById('send-amount').value =
    state.sendAsset === 'usdt' ? state.usdt : state.native
})

document.getElementById('btn-send-confirm').addEventListener('click', async () => {
  const to = document.getElementById('send-to').value.trim()
  const amount = document.getElementById('send-amount').value.trim()
  const asset = state.sendAsset
  setError('send-error', '')
  setSuccess('send-success', '')
  if (!to) return setError('send-error', 'Enter a recipient address')
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return setError('send-error', 'Enter a valid amount')
  }
  const maxBalance = asset === 'usdt' ? parseFloat(state.usdt) : parseFloat(state.native)
  if (parseFloat(amount) > maxBalance) {
    const meta = NET_META[state.networkId] || NET_META.solana
    return setError('send-error', `Insufficient ${asset === 'usdt' ? 'USDt' : meta.symbol} balance`)
  }
  setDisabled('btn-send-confirm', true)
  try {
    const { hash } = await send('WALLET_SEND', { to, amount, asset })
    setSuccess('send-success', `✓ Sent! Tx: ${hash.slice(0, 24)}…`)
    setTimeout(() => loadHome(), 3000)
  } catch (err) {
    setError('send-error', err.message)
  } finally {
    setDisabled('btn-send-confirm', false)
  }
})

// ── Receive screen ────────────────────────────────────────────────────────────

document.getElementById('btn-receive-back').addEventListener('click', () => showScreen('home'))

document.getElementById('btn-copy-address').addEventListener('click', () => {
  const addr = state.address || ''
  navigator.clipboard.writeText(addr).then(() => {
    const btn = document.getElementById('btn-copy-address')
    btn.textContent = '✓ Copied!'
    btn.classList.add('copied')
    setTimeout(() => { btn.textContent = 'Copy Address'; btn.classList.remove('copied') }, 2000)
  })
})

// ── Settings screen ───────────────────────────────────────────────────────────

document.getElementById('btn-settings-back').addEventListener('click', () => showScreen('home'))

document.getElementById('btn-settings-rpc-save').addEventListener('click', async () => {
  const rpcUrl = document.getElementById('settings-rpc').value.trim()
  try {
    await send('RPC_SET', { networkId: state.networkId, rpcUrl })
    setSuccess('rpc-status', 'Saved — unlock wallet again to apply')
  } catch (err) {
    setSuccess('rpc-status', '')
    setError('rpc-status', err.message)
  }
})

document.getElementById('btn-reset-wallet').addEventListener('click', () => {
  if (confirm('This will permanently delete your wallet. Are you sure?')) {
    chrome.storage.local.clear(() => { showScreen('setup'); resetSetupForms() })
  }
})


// ── Sign screen ───────────────────────────────────────────────────────────────

document.getElementById('btn-go-sign').addEventListener('click', () => {
  const meta = NET_META[state.networkId] || NET_META.solana
  if (meta.type === 'btc' || meta.type === 'spark') {
    document.getElementById('sign-error') && (document.getElementById('sign-error').textContent = 'Signing not supported on ' + meta.name)
  }
  document.getElementById('sign-message').value = ''
  document.getElementById('sign-result').style.display = 'none'
  setError('sign-error', '')
  showScreen('sign')
})

document.getElementById('btn-sign-back').addEventListener('click', () => showScreen('home'))

document.getElementById('btn-sign-confirm').addEventListener('click', async () => {
  const message = document.getElementById('sign-message').value.trim()
  setError('sign-error', '')
  document.getElementById('sign-result').style.display = 'none'
  if (!message) return setError('sign-error', 'Enter a message to sign')
  setDisabled('btn-sign-confirm', true)
  try {
    const { signature } = await send('WALLET_SIGN', { message })
    document.getElementById('sign-output').textContent = signature
    document.getElementById('sign-result').style.display = 'block'
  } catch (err) {
    setError('sign-error', err.message)
  } finally {
    setDisabled('btn-sign-confirm', false)
  }
})

document.getElementById('btn-copy-sig').addEventListener('click', () => {
  const sig = document.getElementById('sign-output').textContent
  navigator.clipboard.writeText(sig).then(() => {
    const btn = document.getElementById('btn-copy-sig')
    btn.textContent = '✓ Copied!'
    setTimeout(() => { btn.textContent = 'Copy Signature' }, 2000)
  })
})

// ── Utilities ─────────────────────────────────────────────────────────────────

function resetSetupForms () {
  document.getElementById('setup-main').style.display = 'block'
  document.getElementById('setup-create').style.display = 'none'
  document.getElementById('setup-mnemonic').style.display = 'none'
  document.getElementById('setup-import').style.display = 'none'
  document.getElementById('create-password').value = ''
  document.getElementById('create-confirm').value = ''
  document.getElementById('import-mnemonic').value = ''
  document.getElementById('import-password').value = ''
  document.getElementById('import-confirm').value = ''
}

// ── Init ──────────────────────────────────────────────────────────────────────

boot()
