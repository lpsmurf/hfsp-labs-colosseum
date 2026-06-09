// Popup UI — vanilla JS state machine
// All wallet logic lives in background/service-worker.js
// Popup communicates via chrome.runtime.sendMessage

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

// ── State ─────────────────────────────────────────────────────────────────────

let state = { address: null, usdt: '0', sol: '0' }

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot () {
  try {
    const { initialized, unlocked, address } = await send('WALLET_STATE')
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

// Show create form
document.getElementById('btn-create-new').addEventListener('click', () => {
  document.getElementById('setup-main').style.display = 'none'
  document.getElementById('setup-create').style.display = 'block'
  document.getElementById('create-password').focus()
})

// Show import form
document.getElementById('btn-import-wallet').addEventListener('click', () => {
  document.getElementById('setup-main').style.display = 'none'
  document.getElementById('setup-import').style.display = 'block'
  document.getElementById('import-mnemonic').focus()
})

document.getElementById('btn-import-back').addEventListener('click', () => {
  document.getElementById('setup-import').style.display = 'none'
  document.getElementById('setup-main').style.display = 'block'
})

// Create wallet
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
  const { address } = await send('WALLET_STATE')
  state.address = address
  showScreen('home')
  loadHome()
})

// Import wallet
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
    const { address } = await send('WALLET_UNLOCK', { password: pw })
    state.address = address
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
  document.getElementById('home-address').textContent = truncate(state.address)

  statusText.textContent = 'Fetching balances…'
  dot.classList.remove('offline')

  try {
    const { sol, usdt } = await send('WALLET_BALANCE')
    state.sol = sol
    state.usdt = usdt
    document.getElementById('balance-usdt').textContent = `${parseFloat(usdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDt`
    document.getElementById('balance-sol').textContent = `${parseFloat(sol).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} SOL`
    statusText.textContent = 'Mainnet · Updated'
    dot.classList.remove('offline')
  } catch (err) {
    statusText.textContent = err.message
    dot.classList.add('offline')
  }
}

document.getElementById('btn-lock').addEventListener('click', async () => {
  await send('WALLET_LOCK')
  state = { address: null, usdt: '0', sol: '0' }
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
  const data = await chrome.storage.local.get(['wdk_wallet_rpc'])
  const rpc = data.wdk_wallet_rpc || ''
  document.getElementById('settings-rpc').value = rpc
  showScreen('settings')
})

// ── Send screen ───────────────────────────────────────────────────────────────

document.getElementById('btn-send-back').addEventListener('click', () => {
  showScreen('home')
})

document.getElementById('btn-send-max').addEventListener('click', () => {
  document.getElementById('send-amount').value = state.usdt
})

document.getElementById('btn-send-confirm').addEventListener('click', async () => {
  const to = document.getElementById('send-to').value.trim()
  const amount = document.getElementById('send-amount').value.trim()
  setError('send-error', '')
  setSuccess('send-success', '')
  if (!to) return setError('send-error', 'Enter a recipient address')
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return setError('send-error', 'Enter a valid amount')
  }
  if (parseFloat(amount) > parseFloat(state.usdt)) {
    return setError('send-error', 'Insufficient USDt balance')
  }
  setDisabled('btn-send-confirm', true)
  try {
    const { hash } = await send('WALLET_SEND', { to, amount })
    setSuccess('send-success', `✓ Sent! Tx: ${hash.slice(0, 24)}…`)
    // Reload balance after send
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
    await send('RPC_SET', { rpcUrl })
    setSuccess('rpc-status', 'Saved — unlock wallet again to apply')
  } catch (err) {
    setSuccess('rpc-status', '')
    setError('rpc-status', err.message)
  }
})

document.getElementById('btn-reset-wallet').addEventListener('click', () => {
  if (confirm('This will permanently delete your wallet. Are you sure?')) {
    chrome.storage.local.clear(() => {
      showScreen('setup')
      resetSetupForms()
    })
  }
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
