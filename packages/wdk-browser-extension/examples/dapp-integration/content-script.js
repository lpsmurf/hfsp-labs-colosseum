// content-script.js — bridge between web pages and the WDK wallet service worker
//
// Add to manifest.json:
//   "content_scripts": [{
//     "matches": ["<all_urls>"],
//     "js": ["content-script.js"],
//     "run_at": "document_start"
//   }]

// Inject window.wdkWallet API into the page
const script = document.createElement('script')
script.src = chrome.runtime.getURL('injected.js')
script.onload = () => script.remove()
;(document.head || document.documentElement).appendChild(script)

// Relay messages: page → extension
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'wdk-page') return
  const { id, type, payload } = event.data

  chrome.runtime.sendMessage({ type, ...payload }, (response) => {
    window.postMessage({ source: 'wdk-extension', id, ...response }, '*')
  })
})
