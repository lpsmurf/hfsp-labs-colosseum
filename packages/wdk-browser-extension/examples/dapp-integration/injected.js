// injected.js — runs in the page context, exposes window.wdkWallet
// This file must be listed in manifest.json "web_accessible_resources"

;(function () {
  let msgId = 0

  function request (type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId
      window.postMessage({ source: 'wdk-page', id, type, payload }, '*')
      const handler = (event) => {
        if (event.data?.source !== 'wdk-extension' || event.data.id !== id) return
        window.removeEventListener('message', handler)
        if (event.data.error) reject(new Error(event.data.error))
        else resolve(event.data.data)
      }
      window.addEventListener('message', handler)
      setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('WDK: timeout')) }, 30000)
    })
  }

  window.wdkWallet = {
    // Get current wallet state (address, network, locked status)
    getState: () => request('WALLET_STATE'),

    // Get balances for active network
    getBalance: () => request('WALLET_BALANCE'),

    // Sign a message — returns { signature, address, network }
    signMessage: (message) => request('WALLET_SIGN', { message }),

    // Send tokens — asset: 'usdt' | 'native'
    send: (to, amount, asset = 'usdt') => request('WALLET_SEND', { to, amount, asset }),

    // Estimate fee before sending
    estimateFee: (to, amount, asset = 'usdt') => request('WALLET_QUOTE', { to, amount, asset }),

    // Switch network
    switchNetwork: (networkId) => request('NETWORK_SET', { networkId }),

    // Get transaction history (BTC/Lightning only)
    getHistory: (limit = 10) => request('WALLET_HISTORY', { limit }),
  }

  window.dispatchEvent(new Event('wdkWalletReady'))
})()
