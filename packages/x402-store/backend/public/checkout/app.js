// Checkout for wallets that cannot sign x402 payments (MiniPay, Valora, MetaMask…).
// No dependencies: the store's CSP only allows same-origin scripts, and the
// server hands us a ready-made transaction, so no ABI encoding happens here.

const $ = id => document.getElementById(id);
const MOBILE = new Set(["mobile_talk_time", "mobile_data", "mobile_credits", "mobile_bundle"]);
const CELO_CHAIN = "0xa4ec"; // 42220

let brands = [];
let products = [];
let quote = null;
let timer = null;

const setStatus = (el, msg, kind = "") => { el.textContent = msg; el.className = `status ${kind}`; };

async function api(path, body) {
  const res = await fetch(path, body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 402) {
    const detail = data?.details?.fieldErrors ? Object.values(data.details.fieldErrors).flat().join(" ") : "";
    throw new Error(detail || data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ── Product selection ────────────────────────────────────────────────────────
async function loadBrands() {
  const country = $("country").value;
  $("brand").disabled = true; $("product").disabled = true; $("quote-btn").disabled = true;
  $("brand").innerHTML = "<option>Loading…</option>"; $("product").innerHTML = "";
  try {
    brands = await api(`/api/brands?country_code=${country}`);
    renderBrands();
  } catch (e) { setStatus($("product-status"), e.message, "err"); }
}

function renderBrands() {
  const showAll = $("all-brands").checked;
  const list = brands.filter(b => showAll || MOBILE.has(b.category))
    .sort((a, b) => Number(MOBILE.has(b.category)) - Number(MOBILE.has(a.category)) || a.brand_name.localeCompare(b.brand_name));
  $("brand").innerHTML = `<option value="">Choose…</option>` + list.map(b =>
    `<option value="${encodeURIComponent(b.brand_name)}" data-cat="${b.category}">${escapeHtml(b.brand_name)}</option>`).join("");
  $("brand").disabled = false;
}

async function loadProducts() {
  const name = decodeURIComponent($("brand").value);
  $("product").disabled = true; $("quote-btn").disabled = true; $("amount-wrap").hidden = true;
  if (!name) return;
  const cat = $("brand").selectedOptions[0]?.dataset.cat;
  $("phone-wrap").hidden = !MOBILE.has(cat);
  try {
    products = await api(`/api/catalog?country_code=${$("country").value}&brand_name=${encodeURIComponent(name)}`);
    $("product").innerHTML = products.map((p, i) => {
      const label = p.is_range ? `${p.currency} ${p.min_value}–${p.max_value}` : `${p.denomination_label} · ~$${p.price_usdc}`;
      return `<option value="${i}">${escapeHtml(label)}</option>`;
    }).join("");
    $("product").disabled = false;
    onProduct();
  } catch (e) { setStatus($("product-status"), e.message, "err"); }
}

function onProduct() {
  const p = products[Number($("product").value)];
  if (!p) return;
  $("amount-wrap").hidden = !p.is_range;
  if (p.is_range) {
    $("amount-currency").textContent = p.currency;
    $("amount").min = p.min_value; $("amount").max = p.max_value;
    $("amount").value = $("amount").value || p.min_value;
    $("amount-range").textContent = `Between ${p.min_value} and ${p.max_value} ${p.currency}`;
  }
  $("quote-btn").disabled = false;
}

// ── Quote ────────────────────────────────────────────────────────────────────
async function getQuote() {
  const p = products[Number($("product").value)];
  const item = { product_id: p.product_id };
  if (p.is_range) item.product_value = Number($("amount").value);
  if (!$("phone-wrap").hidden) item.beneficiary_account = $("phone").value.trim();
  const email = $("email").value.trim();

  $("quote-btn").disabled = true;
  setStatus($("product-status"), "Getting the best price…");
  try {
    quote = await api("/api/celo/checkout/quote", { email, items: [item], asset: $("asset").value });
    $("price").textContent = Number(quote.amountDisplay).toFixed(2);
    $("price-asset").textContent = quote.asset === "USAT" ? "USA₮" : quote.asset;
    $("step-product").hidden = true; $("step-pay").hidden = false;
    setStatus($("product-status"), ""); setStatus($("pay-status"), "");
    startCountdown(new Date(quote.expiresAt).getTime());
  } catch (e) {
    setStatus($("product-status"), e.message, "err");
  } finally { $("quote-btn").disabled = false; }
}

function startCountdown(until) {
  clearInterval(timer);
  const tick = () => {
    const s = Math.max(0, Math.round((until - Date.now()) / 1000));
    $("countdown").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if (s === 0) { clearInterval(timer); $("pay-btn").disabled = true; setStatus($("pay-status"), "Price expired — get a new price.", "err"); }
  };
  tick(); timer = setInterval(tick, 1000);
}

// ── Pay ──────────────────────────────────────────────────────────────────────
async function pay() {
  const eth = window.ethereum;
  if (!eth) { setStatus($("pay-status"), "Open this page inside MiniPay, Valora or a wallet browser.", "err"); return; }
  $("pay-btn").disabled = true;
  let txHash;
  try {
    const [from] = await eth.request({ method: "eth_requestAccounts" });
    if ((await eth.request({ method: "eth_chainId" })) !== CELO_CHAIN) {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CELO_CHAIN }] });
    }
    const tx = { from, to: quote.transaction.to, data: quote.transaction.data, value: "0x0" };
    // MiniPay pays gas in a stablecoin via Celo fee abstraction and only sends
    // legacy transactions; other wallets pay gas in CELO and pick their own fees.
    if (eth.isMiniPay) tx.feeCurrency = quote.feeCurrency;

    setStatus($("pay-status"), "Confirm the payment in your wallet…");
    txHash = await eth.request({ method: "eth_sendTransaction", params: [tx] });

    setStatus($("pay-status"), "Payment sent. Confirming it on Celo…");
    clearInterval(timer);
    const confirmed = await confirmWithRetry(txHash);
    if (confirmed.ok === false && !confirmed.status) throw new Error(confirmed.error || "Could not confirm the payment.");
    showProgress(txHash);
    await trackOrder(confirmed, txHash);
  } catch (e) {
    if (txHash) {
      // Money may have moved: never offer the pay button again for this quote.
      showProgress(txHash);
      $("done-title").textContent = e.message || "We could not confirm your payment yet.";
      $("done-title").className = "status err";
      return;
    }
    const rejected = e?.code === 4001;
    setStatus($("pay-status"), rejected ? "Payment cancelled." : (e.message || "Payment failed."), "err");
    $("pay-btn").disabled = false;
  }
}

async function confirmWithRetry(txHash) {
  // The server waits briefly for the block and answers 409 until it lands.
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch("/api/celo/checkout/confirm", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: quote.orderId, txHash }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && /not confirmed/i.test(data.error || "")) { await sleep(3000); continue; }
    return data;
  }
  return { ok: false, error: "Your payment has not confirmed yet. It is safe — reopen this page later with the order status link." };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const STAGE_TEXT = {
  paid: "Payment confirmed. Buying your product…",
  fulfilling: "Payment confirmed. Buying your product…",
  delivering: "Bought. The supplier is delivering it — usually 1–15 minutes.",
  delivered: "Done — your top-up or voucher has been delivered.",
  failed: "We received your payment, but delivery needs a check.",
};

function showProgress(txHash) {
  $("step-pay").hidden = true; $("step-done").hidden = false;
  $("done-detail").innerHTML = `Order ${escapeHtml(quote.orderId)} · <a href="https://celoscan.io/tx/${txHash}" target="_blank" rel="noopener">view payment</a>` +
    ` · you can close this page; the code or top-up still arrives.`;
}

// Poll until delivered or failed. Delivery continues server-side if the page closes.
async function trackOrder(data, txHash) {
  for (let i = 0; i < 240; i++) {
    const status = data.status || "fulfilling";
    const done = status === "delivered", failed = status === "failed";
    $("done-title").textContent = STAGE_TEXT[status] || "Working on your order…";
    $("done-title").className = `status ${failed ? "err" : "ok"}`;
    if (failed && data.error) $("done-detail").innerHTML += ` · ${escapeHtml(data.error)}`;
    if (done || failed) {
      if (data.result) { $("done-result").hidden = false; $("done-result").textContent = JSON.stringify(data.result, null, 2); }
      return;
    }
    await sleep(5000);
    data = await api(`/api/celo/checkout/${quote.orderId}`).catch(() => data);
  }
}

function reset() {
  clearInterval(timer); quote = null;
  $("step-done").hidden = true; $("step-pay").hidden = true; $("step-product").hidden = false;
  $("pay-btn").disabled = false; $("done-result").hidden = true;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

$("country").addEventListener("change", loadBrands);
$("all-brands").addEventListener("change", renderBrands);
$("brand").addEventListener("change", loadProducts);
$("product").addEventListener("change", onProduct);
$("quote-btn").addEventListener("click", getQuote);
$("pay-btn").addEventListener("click", pay);
$("back-btn").addEventListener("click", reset);
$("again-btn").addEventListener("click", reset);
loadBrands();
