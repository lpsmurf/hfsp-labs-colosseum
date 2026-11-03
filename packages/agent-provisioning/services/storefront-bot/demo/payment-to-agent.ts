// Demo: payment → Pro upgrade → provisioned agent, end to end.
//
// Performs a REAL on-chain SPL transfer on devnet (the script creates its own
// 6-decimal demo mint — set SOLANA_USDC_MINT to it on the server), proves the
// fail-closed verification paths, then drives provisioning via the HTTP API
// and shows the agent responding on its dashboard port.
//
// Run via demo/run-demo.sh, or directly:
//   DEMO_API_URL=http://127.0.0.1:3001 \
//   SOLANA_WALLET_ADDRESS=<platform-wallet-pubkey> \
//   SOLANA_RPC_URL=https://api.devnet.solana.com \
//   npx ts-node demo/payment-to-agent.ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from '@solana/spl-token';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.DEMO_API_URL ?? 'http://127.0.0.1:3001';
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PLATFORM_WALLET = process.env.SOLANA_WALLET_ADDRESS ?? '';
const PAYER_FILE = process.env.DEMO_PAYER_FILE ?? path.join(process.cwd(), '.demo', 'payer.json');
const DECIMALS = 6;
const PRICE_USDC = 9;

const conn = new Connection(RPC, 'confirmed');

function log(step: string, msg: string) {
  console.log(`\n\x1b[1m▶ ${step}\x1b[0m\n  ${msg}`);
}

async function api(path: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

async function airdrop(pubkey: PublicKey, sol: number) {
  for (let i = 0; i < 4; i++) {
    try {
      const sig = await conn.requestAirdrop(pubkey, sol * 1e9);
      await conn.confirmTransaction(sig, 'confirmed');
      return;
    } catch {
      await new Promise(r => setTimeout(r, 4000 * (i + 1)));
    }
  }
  throw new Error(`devnet airdrop failed — fund ${pubkey.toBase58()} manually and re-run`);
}

async function main() {
  if (!PLATFORM_WALLET) {
    console.error('SOLANA_WALLET_ADDRESS required (the platform wallet the server verifies against).');
    process.exit(1);
  }

  // ── 0. Demo funding: reuse the runner's funded payer, or bootstrap a mint ──
  let payer: Keypair;
  let mint: PublicKey;
  if (fs.existsSync(PAYER_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PAYER_FILE, 'utf8'));
    payer = Keypair.fromSecretKey(Uint8Array.from(saved.payer));
    mint = new PublicKey(process.env.DEMO_USDC_MINT ?? saved.mint);
    log('0/8  Reusing demo payer + mint', `${payer.publicKey.toBase58()} / ${mint.toBase58()}`);
  } else {
    payer = Keypair.generate();
    await airdrop(payer.publicKey, 0.5);
    mint = await createMint(conn, payer, payer.publicKey, null, DECIMALS);
    const payerAta0 = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
    await getOrCreateAssociatedTokenAccount(conn, payer, mint, new PublicKey(PLATFORM_WALLET));
    await mintTo(conn, payer, mint, payerAta0.address, payer, BigInt(100 * 10 ** DECIMALS));
    log('0/8  Demo USDC stand-in minted', `mint=${mint.toBase58()}  (server must have SOLANA_USDC_MINT=${mint.toBase58()})`);
  }
  const payerAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  const platformAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, new PublicKey(PLATFORM_WALLET));

  // ── 1. Sign up ────────────────────────────────────────────────────────────
  const email = `demo-${Date.now()}@hfsp.dev`;
  const signup = await api('/api/v1/auth/email-signup', {
    method: 'POST', body: { email, password: 'demo-password-123', firstName: 'Demo' },
  });
  if (signup.status !== 201) throw new Error(`signup failed: ${JSON.stringify(signup.json)}`);
  const token = signup.json.token as string;
  log('1/8  Signed up', `${email} (tier: ${signup.json.user.subscription})`);

  // ── 2. Create payment ─────────────────────────────────────────────────────
  const qr = await api('/api/v1/auth/solana-pay-qr', { method: 'POST', token });
  if (qr.status !== 200) throw new Error(`solana-pay-qr failed: ${JSON.stringify(qr.json)}`);
  const paymentId = qr.json.paymentId as string;
  log('2/8  Payment created', `${paymentId} — ${qr.json.amount} ${qr.json.currency}`);

  // ── 3. Negative checks: verification must fail CLOSED ─────────────────────
  const bogus = await api('/api/v1/auth/verify-payment', {
    method: 'POST', token,
    body: { paymentId, transactionSignature: 'NotARealSignature_111111111111111111111111111111111111111111111111' },
  });
  log('3/8  Bogus signature rejected', `HTTP ${bogus.status} — ${bogus.json.error}`);
  if (bogus.status === 200) throw new Error('REGRESSION: bogus signature accepted');

  const underpaySig = await transfer(
    conn, payer, payerAta.address, platformAta.address, payer,
    BigInt(1 * 10 ** DECIMALS),
  );
  const underpay = await api('/api/v1/auth/verify-payment', {
    method: 'POST', token,
    body: { paymentId, transactionSignature: underpaySig },
  });
  log('3/8  Underpayment rejected', `HTTP ${underpay.status} — ${JSON.stringify(underpay.json)}`);
  if (underpay.status === 200) throw new Error('REGRESSION: underpayment accepted');

  // A valid transfer to the WRONG wallet must also fail
  const wrongWallet = Keypair.generate().publicKey;
  const wrongAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, wrongWallet);
  const wrongSig = await transfer(
    conn, payer, payerAta.address, wrongAta.address, payer,
    BigInt(PRICE_USDC * 10 ** DECIMALS),
  );
  const wrong = await api('/api/v1/auth/verify-payment', {
    method: 'POST', token,
    body: { paymentId, transactionSignature: wrongSig },
  });
  log('3/8  Wrong-recipient rejected', `HTTP ${wrong.status} — ${JSON.stringify(wrong.json)}`);
  if (wrong.status === 200) throw new Error('REGRESSION: payment to wrong wallet accepted');

  // An unauthenticated verify call must fail
  const unauth = await api('/api/v1/auth/verify-payment', {
    method: 'POST', body: { paymentId, transactionSignature: wrongSig },
  });
  log('3/8  Unauthenticated verify rejected', `HTTP ${unauth.status} — ${unauth.json.error}`);
  if (unauth.status !== 401) throw new Error('REGRESSION: verify-payment has no auth');

  // ── 4. Pay on chain + verify ───────────────────────────────────────────────
  const sig = await transfer(
    conn, payer, payerAta.address, platformAta.address, payer,
    BigInt(PRICE_USDC * 10 ** DECIMALS),
  );
  log('4/8  On-chain transfer', `sig=${sig}\n  https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  const verified = await api('/api/v1/auth/verify-payment', {
    method: 'POST', token, body: { paymentId, transactionSignature: sig },
  });
  if (verified.status !== 200) throw new Error(`verify-payment failed: ${JSON.stringify(verified.json)}`);
  log('4/8  Payment verified', `${verified.json.message} (tier: ${verified.json.subscriptionTier})`);

  // ── 5. Provision agent ─────────────────────────────────────────────────────
  const created = await api('/api/v1/agents', {
    method: 'POST', token,
    body: {
      name: 'Demo Agent',
      provider: 'openrouter',
      model: 'openrouter/auto',
      botToken: `${Date.now()}:DEMO-TOKEN`,
      openrouterApiKey: 'sk-or-demo-key',
    },
  });
  if (created.status !== 202) throw new Error(`create agent failed: ${JSON.stringify(created.json)}`);
  const agent = created.json.agent;
  log('5/8  Provisioning started', `${agent.id} on dashboard port ${agent.dashboardPort}`);

  // ── 6. Wait for running ────────────────────────────────────────────────────
  let status = '';
  for (let i = 0; i < 30; i++) {
    const s = await api(`/api/v1/agents/${agent.id}/status`, { token });
    status = s.json?.agent?.status ?? s.json?.status ?? 'unknown';
    if (status !== 'provisioning') break;
    await new Promise(r => setTimeout(r, 2000));
  }
  log('6/8  Agent status', `${agent.id} → ${status}`);

  // ── 7. Prove the agent responds on its port ────────────────────────────────
  let portReply = '';
  for (let i = 0; i < 10 && !portReply; i++) {
    try {
      const health = await fetch(`http://127.0.0.1:${agent.dashboardPort}`, { signal: AbortSignal.timeout(2000) });
      portReply = await health.text();
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (portReply) {
    log('7/8  Agent responding', `http://127.0.0.1:${agent.dashboardPort} → "${portReply}"`);
  } else {
    log('7/8  Agent port check', `dashboard port ${agent.dashboardPort} not reachable (expected outside demo mode — the container runs on the tenant VPS)`);
  }

  // ── 8. Drive the Telegram wizard: OpenRouter + Kimi keys must persist
  //        ENCRYPTED in wizard_state (this is the reported gap) ─────────────
  const tg = async (tgId: number, update: unknown) => {
    await fetch(`${API}/telegram/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update),
    });
    await new Promise(r => setTimeout(r, 1200)); // handler is fire-and-forget
  };
  const runWizard = async (tgId: number, provider: 'openrouter' | 'kimi', apiKey: string) => {
    const msg = (text: string) => tg(tgId, { message: { chat: { id: tgId }, from: { id: tgId }, text } });
    const cb = (data: string) => tg(tgId, { callback_query: { id: `cb_${tgId}_${data}`, from: { id: tgId }, message: { chat: { id: tgId } }, data } });
    await msg('create agent');            // → setup_intro
    await cb('flow:start_setup');         // → await_agent_name
    await msg('Demo Wizard Bot');         // → botfather_helper
    await cb('flow:token_ready');         // → await_bot_token
    await msg(`999888777${tgId % 1000}:DEMO-BOT-TOKEN-${tgId}`); // → await_bot_username (getMe fails offline)
    await msg('demo_wizard_bot');         // → await_template
    await cb('template:blank');           // → choose_provider
    await cb(`provider:${provider}`);     // → await_<provider>_api_key
    await msg(apiKey);                    // → await_model_preset, key stored in wizard data
  };

  const OR_TG = 910001;
  const KIMI_TG = 910002;
  const OR_KEY = 'sk-or-demo-wizard-key-12345';
  const KIMI_KEY = 'sk-kimi-demo-wizard-key-12345';
  await runWizard(OR_TG, 'openrouter', OR_KEY);
  await runWizard(KIMI_TG, 'kimi', KIMI_KEY);

  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), '.demo', 'demo.sqlite');
  const sqlite = new Database(dbPath, { readonly: true });
  const wrows = sqlite.prepare(
    'SELECT telegram_user_id, step, data_json FROM wizard_state WHERE telegram_user_id IN (?, ?)'
  ).all(OR_TG, KIMI_TG) as Array<{ telegram_user_id: number; step: string; data_json: string }>;

  for (const r of wrows) {
    const d = JSON.parse(r.data_json);
    const keyField = r.telegram_user_id === OR_TG ? 'openrouterApiKey' : 'kimiApiKey';
    const stored = d[keyField] ?? '';
    const want = r.telegram_user_id === OR_TG ? OR_KEY : KIMI_KEY;
    if (stored === want) throw new Error(`REGRESSION: ${keyField} stored in PLAINTEXT in wizard_state`);
    if (!stored.startsWith('enc:')) throw new Error(`${keyField} missing or unencrypted in wizard_state (step=${r.step})`);
    log('8/8  Wizard key encrypted at rest', `${keyField} → ${stored.slice(0, 28)}… (step=${r.step})`);
  }
  if (wrows.length !== 2) throw new Error(`expected 2 wizard_state rows, got ${wrows.length}`);

  console.log('\n✅ Demo complete: paid on-chain → verified → Pro → agent provisioned → wizard keys encrypted.\n');
}

main().catch(err => { console.error('\n❌ Demo failed:', err?.message ?? err); process.exit(1); });
