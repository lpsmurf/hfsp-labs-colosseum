import { ShellProvisioner } from './provisioners/ShellProvisioner';
import { ProvisionerConfig } from './provisioners/types';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import * as nacl from 'tweetnacl';
import { PublicKey, Connection } from '@solana/web3.js';
import QRCode from 'qrcode';

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN_FILE = process.env.TELEGRAM_BOT_TOKEN_FILE ?? '/home/clawd/.openclaw/secrets/hfsp_agent_bot.token';
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'storefront.sqlite');

// DB encryption (beta)
// Single server-side master key.
// Prefer env HFSP_DB_SECRET, else read from HFSP_DB_SECRET_FILE.
// DO NOT commit the secret.
const HFSP_DB_SECRET_FILE = process.env.HFSP_DB_SECRET_FILE ?? '/home/clawd/.openclaw/secrets/hfsp_db_secret';
function loadDbSecret(): string {
  const env = process.env.HFSP_DB_SECRET?.trim();
  if (env && env.length >= 16) return env;
  try {
    const file = fs.readFileSync(HFSP_DB_SECRET_FILE, 'utf8').trim();
    if (file && file.length >= 16) return file;
  } catch {
    // ignore
  }
  throw new Error(
    `Missing DB secret. Set HFSP_DB_SECRET or create ${HFSP_DB_SECRET_FILE} (min 16 chars).`
  );
}
const HFSP_DB_SECRET = loadDbSecret();

type EncPayloadV1 = { v: 1; alg: 'aes-256-gcm'; kdf: 'scrypt'; salt: string; iv: string; tag: string; data: string };

function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.scryptSync(secret, salt, 32);
}

function tokenFingerprint(token: string): string {
  // Deterministic, non-reversible fingerprint to detect token reuse.
  // Uses HMAC with the DB secret so tokens can't be recovered from the fingerprint.
  const t = (token ?? '').trim();
  if (!t) return '';
  return crypto.createHmac('sha256', HFSP_DB_SECRET).update(t).digest('hex');
}

function encryptString(plain: string): string {
  const p = (plain ?? '').toString();
  if (!p) return '';
  if (p.startsWith('enc:')) return p; // already encrypted
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(HFSP_DB_SECRET, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(p, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncPayloadV1 = {
    v: 1,
    alg: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64')
  };
  return `enc:${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
}

function decryptString(maybeEnc: string): string {
  const s = (maybeEnc ?? '').toString();
  if (!s) return '';
  if (!s.startsWith('enc:')) return s;
  const b64 = s.slice(4);
  const raw = Buffer.from(b64, 'base64').toString('utf8');
  const payload = JSON.parse(raw) as EncPayloadV1;
  if (payload.v !== 1 || payload.alg !== 'aes-256-gcm' || payload.kdf !== 'scrypt') throw new Error('Unsupported enc payload');
  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const key = deriveKey(HFSP_DB_SECRET, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return plain;
}

function protectWizardData(data: WizardData): WizardData {
  const out: WizardData = { ...data };
  if (out.botToken) out.botToken = encryptString(out.botToken);
  if (out.openaiApiKey) out.openaiApiKey = encryptString(out.openaiApiKey);
  if (out.anthropicApiKey) out.anthropicApiKey = encryptString(out.anthropicApiKey);
  if (out.lastGatewayToken) out.lastGatewayToken = encryptString(out.lastGatewayToken);
  return out;
}

function unprotectWizardData(data: WizardData): WizardData {
  const out: WizardData = { ...data };
  try { if (out.botToken) out.botToken = decryptString(out.botToken); } catch {}
  try { if (out.openaiApiKey) out.openaiApiKey = decryptString(out.openaiApiKey); } catch {}
  try { if (out.anthropicApiKey) out.anthropicApiKey = decryptString(out.anthropicApiKey); } catch {}
  try { if (out.lastGatewayToken) out.lastGatewayToken = decryptString(out.lastGatewayToken); } catch {}
  return out;
}

function protectTenantRowTokens(row: any): any {
  if (!row) return row;
  const r = { ...row };
  if (r.gateway_token) r.gateway_token = encryptString(String(r.gateway_token));
  return r;
}

function unprotectTenantRowTokens(row: any): any {
  if (!row) return row;
  const r = { ...row };
  if (r.gateway_token) {
    try { r.gateway_token = decryptString(String(r.gateway_token)); } catch {}
  }
  return r;
}

// Tenant VPS provisioning (private-only)
const TENANT_VPS_HOST = process.env.TENANT_VPS_HOST ?? '187.124.173.69';
const TENANT_VPS_USER = process.env.TENANT_VPS_USER ?? 'root';
const TENANT_VPS_SSH_KEY = process.env.TENANT_VPS_SSH_KEY ?? '/home/clawd/.ssh/id_ed25519_hfsp_provisioner';
const TENANT_VPS_BASEDIR = process.env.TENANT_VPS_BASEDIR ?? '/opt/hfsp/tenants';
const TENANT_RUNTIME_IMAGE = process.env.TENANT_RUNTIME_IMAGE ?? 'hfsp/openclaw-runtime:stable';

// Email auth and Solana payment
const SOLANA_NETWORK = process.env.SOLANA_NETWORK ?? 'devnet';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const SOLANA_WALLET_ADDRESS = process.env.SOLANA_WALLET_ADDRESS ?? '';
const SOLANA_WALLET_SECRET_KEY = process.env.SOLANA_WALLET_SECRET_KEY ?? '';

// Stripe/SumUp (for later fiat implementation)
// const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const TENANT_VPS_SSH_OPTS = ['-i', TENANT_VPS_SSH_KEY, '-o', 'StrictHostKeyChecking=accept-new'];

function readToken(): string {
  const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!t || !t.includes(':')) throw new Error(`Invalid telegram token file: ${TOKEN_FILE}`);
  return t;
}

function ensureDir(p: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

ensureDir(DB_PATH);
const db = new Database(DB_PATH);

db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users (
    telegram_user_id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wizard_state (
    telegram_user_id INTEGER PRIMARY KEY,
    step TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY,
    telegram_user_id INTEGER NOT NULL,
    agent_name TEXT,
    bot_username TEXT,
    template_id TEXT,
    provider TEXT,
    model_preset TEXT,
    dashboard_port INTEGER,
    gateway_token TEXT,
    telegram_token_fp TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    archived_at TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// best-effort migrations for older sqlite files
try { db.exec(`ALTER TABLE tenants ADD COLUMN gateway_token TEXT`); } catch {}
try { db.exec(`ALTER TABLE tenants ADD COLUMN bot_username TEXT`); } catch {}
try { db.exec(`ALTER TABLE tenants ADD COLUMN telegram_token_fp TEXT`); } catch {}
try { db.exec(`ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`); } catch {}
try { db.exec(`ALTER TABLE tenants ADD COLUMN archived_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE tenants ADD COLUMN deleted_at TEXT`); } catch {}
// Email auth columns for users table
// SQLite: ADD COLUMN cannot include UNIQUE — add columns plain then create unique indexes
try { db.exec(`ALTER TABLE users ADD COLUMN user_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN phantom_wallet_address TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free_trial'`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN trial_started_at DATETIME`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN trial_expires_at DATETIME`); } catch {}
// Unique indexes (IF NOT EXISTS handles re-runs safely)
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id) WHERE user_id IS NOT NULL`); } catch {}
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`); } catch {}
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wallet ON users(phantom_wallet_address) WHERE phantom_wallet_address IS NOT NULL`); } catch {}

// Create crypto_payments table for Solana transaction tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS crypto_payments (
    payment_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT,
    phantom_wallet_address TEXT,
    amount_usdc REAL NOT NULL,
    transaction_signature TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT (datetime('now')),
    confirmed_at DATETIME
  );
`);

const BOT_TOKEN = readToken();
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

type WizardStep =
  | 'idle'
  | 'setup_intro'
  | 'await_agent_name'
  | 'botfather_helper'
  | 'await_bot_token'
  | 'await_bot_username'
  | 'await_template'
  | 'choose_provider'
  | 'connect_openai'
  | 'await_openai_api_key'
  | 'await_anthropic_api_key'
  | 'await_openrouter_api_key'
  | 'await_kimi_api_key'
  | 'await_model_preset'
  | 'await_pairing_code';

type WizardData = {
  agentName?: string;
  botToken?: string;
  botTokenFp?: string;
  botTokenConflictTenantId?: string;
  allowTokenReuse?: boolean;
  botUsername?: string; // without @
  templateId?: 'blank' | 'ops_starter';
  provider?: 'openai' | 'anthropic' | 'openrouter' | 'kimi' | 'other';
  openaiConnectMethod?: 'oauth_beta' | 'api_key';
  openaiApiKey?: string;
  anthropicApiKey?: string;
      openrouterApiKey?: string;
      kimiApiKey?: string;
  modelPreset?: 'fast' | 'smart';
  lastTenantId?: string;
  lastDashboardPort?: number;
  lastGatewayToken?: string;
  helpMode?: boolean;
  history?: WizardStep[];
};

function getOrCreateUser(telegramUserId: number) {
  db.prepare(`INSERT OR IGNORE INTO users(telegram_user_id) VALUES (?)`).run(telegramUserId);
}

function getWizard(telegramUserId: number): { step: WizardStep; data: WizardData } {
  const row = db
    .prepare('SELECT step, data_json FROM wizard_state WHERE telegram_user_id = ?')
    .get(telegramUserId) as { step: WizardStep; data_json: string } | undefined;
  if (!row) return { step: 'idle', data: {} };
  try {
    const parsed = JSON.parse(row.data_json) as WizardData;
    return { step: row.step, data: unprotectWizardData(parsed) };
  } catch {
    return { step: row.step, data: {} };
  }
}

function setWizard(telegramUserId: number, step: WizardStep, data: WizardData) {
  const protectedData = protectWizardData(data);
  db.prepare(
    `INSERT INTO wizard_state(telegram_user_id, step, data_json)
     VALUES (?, ?, ?)
     ON CONFLICT(telegram_user_id) DO UPDATE SET step=excluded.step, data_json=excluded.data_json, updated_at=datetime('now')`
  ).run(telegramUserId, step, JSON.stringify(protectedData));
}

function transition(telegramUserId: number, from: WizardStep, to: WizardStep, data: WizardData) {
  const history = Array.isArray(data.history) ? data.history : [];
  const next: WizardData = { ...data, history: [...history, from] };
  setWizard(telegramUserId, to, next);
}

function back(telegramUserId: number, current: WizardStep, data: WizardData): WizardStep {
  const history = Array.isArray(data.history) ? [...data.history] : [];
  const prev = history.pop();
  setWizard(telegramUserId, prev ?? 'idle', { ...data, history });
  return (prev ?? 'idle') as WizardStep;
}

function clearWizard(telegramUserId: number) {
  db.prepare('DELETE FROM wizard_state WHERE telegram_user_id = ?').run(telegramUserId);
}

type ReplyMarkup = Record<string, unknown>;

type SendMessageOpts = {
  reply_markup?: ReplyMarkup;
};

async function sendMessage(chatId: number, text: string, opts: SendMessageOpts = {}) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...opts })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('sendMessage failed', res.status, body);
  }
}

async function sendDocument(chatId: number, filePath: string, filename: string, caption: string = '') {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', caption);

  // Use File for better multipart behavior on Node.
  const buf = fs.readFileSync(filePath);
  const file = new File([buf], filename);
  form.set('document', file);

  const res = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    body: form as any
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('sendDocument failed', res.status, body);
  }
}

async function telegramGetMe(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const t = token.trim();
    const res = await fetch(`https://api.telegram.org/bot${t}/getMe`);
    const j = (await res.json().catch(() => null)) as any;
    if (!j?.ok) return { ok: false, error: j?.description ?? 'getMe failed' };
    const uname = j?.result?.username;
    if (uname && typeof uname === 'string') return { ok: true, username: uname };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

async function answerCallbackQuery(callbackQueryId: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  }).catch(() => undefined);
}

async function renderSetupIntro(chatId: number) {
  await sendMessage(
    chatId,
    [
      'Ready to set up your personal agent?',
      '',
      'You’ll create a new Telegram bot in BotFather, paste the token here, and choose a template.'
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Start setup', callback_data: 'flow:start_setup' }],
          [{ text: 'What is BotFather?', callback_data: 'flow:what_is_botfather' }],
          [{ text: 'Cancel', callback_data: 'flow:cancel' }]
        ]
      }
    }
  );
}

async function renderBotFatherHelper(chatId: number) {
  await sendMessage(
    chatId,
    'BotFather is Telegram\’s official bot creator. You use it once to create *your* bot and get a token.',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open BotFather', url: 'https://t.me/BotFather' }],
          [{ text: 'Show steps', callback_data: 'flow:botfather_steps' }],
          [{ text: 'I created it → paste token', callback_data: 'flow:token_ready' }],
          [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
        ]
      }
    }
  );
}

async function renderBotFatherSteps(chatId: number) {
  await sendMessage(
    chatId,
    [
      'BotFather steps:',
      '1) Open @BotFather',
      '2) Send /newbot',
      '3) Choose any display name',
      '4) Choose a username that ends with “bot”',
      '5) Copy the token it gives you (looks like 123456:AA...)',
      '',
      'When you have it, tap “I created it → paste token”.'
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open BotFather', url: 'https://t.me/BotFather' }],
          [{ text: 'I created it → paste token', callback_data: 'flow:token_ready' }],
          [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
        ]
      }
    }
  );
}

async function renderChooseProvider(chatId: number) {
  await sendMessage(
    chatId,
    'Choose a model provider for your agent:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'OpenAI', callback_data: 'provider:openai' }, { text: 'Claude (Anthropic)', callback_data: 'provider:anthropic' }],
          [{ text: 'Kimi (Moonshot)', callback_data: 'provider:kimi' }, { text: 'OpenRouter', callback_data: 'provider:openrouter' }],
          [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
        ]
      }
    }
  );
}

async function renderConnectOpenAI(chatId: number) {
  await sendMessage(
    chatId,
    [
      'Connect OpenAI to power your agent.',
      '',
      'Choose one:',
      '• OAuth (beta): may not work for everyone',
      '• API key: recommended + reliable'
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'OpenAI OAuth (beta)', callback_data: 'openai:oauth_beta' }],
          [{ text: 'API key (recommended)', callback_data: 'openai:api_key' }],
          [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
        ]
      }
    }
  );
}

async function renderConnectAnthropic(chatId: number) {
  await sendMessage(
    chatId,
    [
      'Paste your Anthropic (Claude) API key.',
      '',
      'Keep it private — it’s a secret.'
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
      }
    }
  );
}

function shSingleQuote(s: string): string {
  // Wrap string for safe single-quoted shell usage.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function sshTenant(command: string): string {
  return execFileSync(
    'ssh',
    [...TENANT_VPS_SSH_OPTS, `${TENANT_VPS_USER}@${TENANT_VPS_HOST}`, command],
    { encoding: 'utf8' }
  ).trim();
}

async function renderChoosePreset(chatId: number) {
  await sendMessage(
    chatId,
    'Choose a model preset:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Fast', callback_data: 'preset:fast' }, { text: 'Smart', callback_data: 'preset:smart' }],
          [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
        ]
      }
    }
  );
}

async function renderAgentsPage(params: {
  chatId: number;
  telegramUserId: number;
  archived: boolean;
  offset: number;
}) {
  const { chatId, telegramUserId, archived, offset } = params;
  const limit = 5;

  const rows = db
    .prepare(
      `SELECT tenant_id, agent_name, bot_username, status, created_at
       FROM tenants
       WHERE telegram_user_id = ?
         AND (status IS NULL OR status != 'deleted')
         AND (${archived ? "status = 'archived'" : "(status IS NULL OR status = 'active')"})
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(telegramUserId, limit + 1, offset) as Array<any>;

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  if (!page.length) {
    await sendMessage(chatId, archived ? 'No archived agents.' : 'No agents yet. Tap “Create agent” to make your first one.');
    await sendMenu(chatId);
    return;
  }

  const inline_keyboard: any[] = page.map((r) => {
    const name = r.agent_name ?? 'Agent';
    const bot = r.bot_username ? `@${r.bot_username}` : r.tenant_id;
    return [{ text: `${name} (${bot})`, callback_data: `agent:details:${r.tenant_id}` }];
  });

  const navRow: any[] = [];
  if (offset > 0) navRow.push({ text: '← Prev', callback_data: `agents:${archived ? 'archived' : 'active'}:${Math.max(0, offset - limit)}` });
  if (hasMore) navRow.push({ text: 'Next →', callback_data: `agents:${archived ? 'archived' : 'active'}:${offset + limit}` });
  if (navRow.length) inline_keyboard.push(navRow);

  inline_keyboard.push([
    archived
      ? { text: 'Back to active', callback_data: 'agents:active:0' }
      : { text: 'Show archived', callback_data: 'agents:archived:0' }
  ]);
  inline_keyboard.push([{ text: 'Back', callback_data: 'flow:back' }]);

  await sendMessage(chatId, archived ? 'Your archived agents:' : 'Your agents:', {
    reply_markup: { inline_keyboard }
  });
}

async function sendMenu(chatId: number) {
  const keyboard = {
    keyboard: [[{ text: 'Create agent' }], [{ text: 'My agents' }], [{ text: 'Help' }], [{ text: 'Cancel' }]],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  await sendMessage(
    chatId,
    [
      'Hey — welcome. I’ll help you set up your personal agent in a couple of minutes.',
      '',
      'What you’ll do:',
      '1) Create a Telegram bot with @BotFather',
      '2) Paste the bot token here (keep it private — it controls your bot)',
      '3) Choose a template (Blank or Ops Starter)',
      '4) Connect a model (OpenAI OAuth beta or API key)',
      '',
      'Ready when you are — tap a button below.'
    ].join('\n'),
    { reply_markup: keyboard }
  );
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// API Key authentication for MCP endpoints
const HFSP_API_KEY = process.env.HFSP_API_KEY || 'test-dev-key-12345';
function requireApiKey(req: any, res: any, next: any) {
  // Skip auth for health check and webhook endpoints
  if (req.path === '/health' || req.path === '/telegram/webhook') {
    return next();
  }
  
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  
  if (token !== HFSP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key' });
  }
  
  next();
}

// CORS: allow ClawDrop wizard frontend
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3001,https://app.hfsp.cloud,https://miniapp.hfsp.cloud').split(',');
app.use((req: any, res: any, next: any) => {
  const origin = (req.headers.origin as string) ?? '';
  if (ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

// Apply API key middleware AFTER CORS so preflight requests work
app.use(requireApiKey);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/telegram/webhook', async (req, res) => {
  // Acknowledge immediately to Telegram.
  res.status(200).json({ ok: true });

  const update = req.body as any;

  const msg = update?.message;
  const cbq = update?.callback_query;

  const chatId: number | undefined = msg?.chat?.id ?? cbq?.message?.chat?.id;
  const telegramUserId: number | undefined = msg?.from?.id ?? cbq?.from?.id;
  const text: string | undefined = msg?.text;

  if (!chatId || !telegramUserId) return;

  getOrCreateUser(telegramUserId);

  try {
    // Handle callback buttons
    if (cbq?.id) {
      await answerCallbackQuery(cbq.id);
      const data: string | undefined = cbq?.data;
      const w = getWizard(telegramUserId);

      // Global callbacks
      if (data === 'flow:cancel') {
        clearWizard(telegramUserId);
        await sendMessage(chatId, 'Cancelled. Use the menu buttons when you’re ready.');
        await sendMenu(chatId);
        return;
      }

      if (data === 'flow:resume') {
        const w2 = getWizard(telegramUserId);
        // Render the appropriate UI for the current step
        if (w2.step === 'setup_intro') {
          await renderSetupIntro(chatId);
          return;
        }
        if (w2.step === 'await_agent_name') {
          await sendMessage(chatId, 'What should we call your agent? (type a name)');
          return;
        }
        if (w2.step === 'botfather_helper') {
          await renderBotFatherHelper(chatId);
          return;
        }
        if (w2.step === 'await_bot_token') {
          await sendMessage(chatId, 'Paste your BotFather token now:', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
            }
          });
          return;
        }
        if (w2.step === 'await_bot_username') {
          await sendMessage(chatId, 'What is your bot username? (example: @my_agent_bot or t.me/my_agent_bot)', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
            }
          });
          return;
        }
        if (w2.step === 'await_template') {
          await sendMessage(chatId, 'Choose a template:', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Blank', callback_data: 'template:blank' }],
                [{ text: 'Ops Starter', callback_data: 'template:ops_starter' }],
                [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
              ]
            }
          });
          return;
        }
        if (w2.step === 'choose_provider') {
          await renderChooseProvider(chatId);
          return;
        }
        if (w2.step === 'connect_openai') {
          await renderConnectOpenAI(chatId);
          return;
        }
        if (w2.step === 'await_openai_api_key') {
          await sendMessage(chatId, 'Paste your OpenAI API key:', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
            }
          });
          return;
        }
        if (w2.step === 'await_anthropic_api_key') {
          await renderConnectAnthropic(chatId);
          return;
        }
        if (w2.step === 'await_model_preset') {
          await renderChoosePreset(chatId);
          return;
        }
        if (w2.step === 'await_pairing_code') {
          await sendMessage(chatId, 'Paste your pairing code here (8 characters):', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Cancel', callback_data: 'flow:cancel' }]]
            }
          });
          return;
        }

        await sendMenu(chatId);
        return;
      }

      if (data === 'flow:back') {
        const prev = back(telegramUserId, w.step, w.data);
        if (prev === 'setup_intro' || prev === 'idle') {
          await renderSetupIntro(chatId);
          return;
        }
        if (prev === 'botfather_helper') {
          await renderBotFatherHelper(chatId);
          return;
        }
        if (prev === 'await_template') {
          // Re-render template buttons
          await sendMessage(chatId, 'Choose a template:', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Blank', callback_data: 'template:blank' }],
                [{ text: 'Ops Starter', callback_data: 'template:ops_starter' }],
                [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
              ]
            }
          });
          return;
        }
        if (prev === 'choose_provider') {
          await renderChooseProvider(chatId);
          return;
        }
        if (prev === 'connect_openai') {
          await renderConnectOpenAI(chatId);
          return;
        }
        await sendMenu(chatId);
        return;
      }

      if (data === 'flow:start_setup') {
        transition(telegramUserId, w.step, 'await_agent_name', w.data);
        await sendMessage(chatId, 'What should we call your agent? (type a name)');
        return;
      }

      if (data === 'flow:what_is_botfather') {
        transition(telegramUserId, w.step, 'botfather_helper', w.data);
        await renderBotFatherHelper(chatId);
        return;
      }

      if (data === 'flow:botfather_steps') {
        // Stay in botfather_helper but show steps
        await renderBotFatherSteps(chatId);
        return;
      }

      if (data === 'flow:token_ready') {
        transition(telegramUserId, w.step, 'await_bot_token', w.data);
        await sendMessage(chatId, 'Paste your BotFather token now:', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
          }
        });
        return;
      }

      // Token reuse guardrail
      if (data === 'token:retry') {
        const w2 = getWizard(telegramUserId);
        // Clear token so user can paste a new one
        setWizard(telegramUserId, 'await_bot_token', { ...w2.data, botToken: undefined, botTokenFp: undefined, botTokenConflictTenantId: undefined, allowTokenReuse: false });
        await sendMessage(chatId, 'Ok — please create a new bot in @BotFather and paste the NEW token here.');
        return;
      }

      if (data === 'token:replace') {
        const w2 = getWizard(telegramUserId);
        const conflictTenant = w2.data.botTokenConflictTenantId;
        if (!conflictTenant) {
          await sendMessage(chatId, 'Missing conflict context. Paste the token again.');
          return;
        }
        // Stop the old container so the token can be reused safely.
        try {
          const oldContainer = `hfsp_${conflictTenant}`;
          sshTenant(`docker rm -f ${oldContainer} >/dev/null 2>&1 || true`);
          db.prepare(`UPDATE tenants SET status='archived', archived_at=datetime('now') WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, conflictTenant);
        } catch (err) {
          console.error('token replace stop old container failed', err);
        }
        // Try to auto-detect username now too
        const token = w2.data.botToken ?? '';
        let uname: string | undefined;
        if (token) {
          const me = await telegramGetMe(token);
          if (me.ok && me.username) uname = me.username;
        }
        if (uname) {
          setWizard(telegramUserId, 'await_template', { ...w2.data, allowTokenReuse: true, botUsername: uname });
          await sendMessage(chatId, `Ok — old runtime stopped + archived. I found your bot: @${uname}`);
          await sendMessage(chatId, 'Choose a template:', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Blank', callback_data: 'template:blank' }],
                [{ text: 'Ops Starter', callback_data: 'template:ops_starter' }],
                [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
              ]
            }
          });
          return;
        }

        setWizard(telegramUserId, 'await_bot_username', { ...w2.data, allowTokenReuse: true });
        await sendMessage(chatId, 'Ok — I stopped the old runtime and archived the previous agent. Now paste the bot username for this token (@name or t.me/name).');
        return;
      }

      // Template selection
      if (data?.startsWith('template:') && w.step === 'await_template') {
        const template = data.split(':')[1];
        const templateId = template === 'ops_starter' ? 'ops_starter' : template === 'blank' ? 'blank' : undefined;
        if (!templateId) {
          await sendMessage(chatId, 'Invalid template selection.');
          return;
        }
        transition(telegramUserId, w.step, 'choose_provider', { ...w.data, templateId });
        await sendMessage(chatId, `Nice — template selected: ${templateId === 'blank' ? 'Blank' : 'Ops Starter'}.`);
        await renderChooseProvider(chatId);
        return;
      }

      // Provider selection
      if (data === 'provider:openai' && w.step === 'choose_provider') {
        transition(telegramUserId, w.step, 'connect_openai', { ...w.data, provider: 'openai' });
        await renderConnectOpenAI(chatId);
        return;
      }
      if (data === 'provider:anthropic' && w.step === 'choose_provider') {
        transition(telegramUserId, w.step, 'await_anthropic_api_key', { ...w.data, provider: 'anthropic' });
        await renderConnectAnthropic(chatId);
        return;
      }
      if (data === 'provider:openrouter' && w.step === 'choose_provider') {
        transition(telegramUserId, w.step, 'await_openrouter_api_key', { ...w.data, provider: 'openrouter' });
        await sendMessage(chatId, 'Please send your OpenRouter API key (sk-or-...):');
        return;
      }
      if (data === 'provider:kimi' && w.step === 'choose_provider') {
        transition(telegramUserId, w.step, 'await_kimi_api_key', { ...w.data, provider: 'kimi' });
        await sendMessage(chatId, 'Please send your Kimi (Moonshot) API key from platform.moonshot.cn:');
        return;
      }
      if (data === 'provider:others' && w.step === 'choose_provider') {
        setWizard(telegramUserId, 'choose_provider', { ...w.data, provider: 'other' });
        await sendMessage(
          chatId,
          'Other providers are coming soon. For beta, please choose OpenAI or Claude.',
          { reply_markup: { inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }]] } }
        );
        await renderChooseProvider(chatId);
        return;
      }

      // OpenAI connect method selection
      if (data === 'openai:api_key' && w.step === 'connect_openai') {
        transition(telegramUserId, w.step, 'await_openai_api_key', { ...w.data, openaiConnectMethod: 'api_key' });
        await sendMessage(
          chatId,
          [
            'Paste your OpenAI API key.',
            '',
            'It looks like: sk-... (keep it private — it’s a secret).'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
            }
          }
        );
        return;
      }

      if (data === 'openai:oauth_beta' && w.step === 'connect_openai') {
        // Best-effort: we don't have the web callback implemented yet.
        setWizard(telegramUserId, 'connect_openai', { ...w.data, openaiConnectMethod: 'oauth_beta' });
        await sendMessage(
          chatId,
          [
            'OAuth (beta) is coming next.',
            '',
            'For beta, please use API key so we can finish provisioning end-to-end.'
          ].join('\n')
        );
        await renderConnectOpenAI(chatId);
        return;
      }

      // Preset selection - generate SSH key and show Provision button
      if (data?.startsWith('preset:') && w.step === 'await_model_preset') {
        const preset = data.split(':')[1];
        const modelPreset = preset === 'fast' ? 'fast' : preset === 'smart' ? 'smart' : undefined;
        if (!modelPreset) {
          await sendMessage(chatId, 'Invalid preset.');
          return;
        }
        
        // Generate SSH key now (for dashboard access)
        let keyBase: string;
        const tenantId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfsp-dash-'));
          keyBase = path.join(tmpDir, `hfsp_${tenantId}`);
          execFileSync('ssh-keygen', ['-t', 'ed25519', '-C', tenantId, '-f', keyBase, '-N', ''], { stdio: 'ignore' });
          
          await sendMessage(
            chatId,
            [
              `✅ ${modelPreset === 'fast' ? 'Fast' : 'Smart'} preset selected.`,
              '',
              'Your setup is complete. Ready to provision your agent?'
            ].join('\n')
          );
          
          // Send SSH key file
          await sendDocument(chatId, keyBase, `dashboard_${tenantId}.key`, 'Your dashboard SSH key (keep private). Save this for later access.');
          
          // Save preset for provisioning
          setWizard(telegramUserId, 'idle', { ...w.data, modelPreset });
          
          // Show Provision button
          await sendMessage(
            chatId,
            'Tap below to create your agent:',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Provision Agent', callback_data: 'provision:start' }],
                  [{ text: 'Cancel', callback_data: 'flow:cancel' }]
                ]
              }
            }
          );
        } catch (e) {
          console.error('SSH key generation failed:', e);
          await sendMessage(chatId, '⚠️ Key generation failed. Continue anyway?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Provision Agent', callback_data: 'provision:start' }],
                [{ text: 'Cancel', callback_data: 'flow:cancel' }]
              ]
            }
          });
          setWizard(telegramUserId, 'idle', { ...w.data, modelPreset });
        }
        return;
      }

      // Provision: create tenant + start container
      if (data === 'provision:start' || data === 'provision:retry') {
        try {
          await sendMessage(chatId, data === 'provision:retry' ? 'Retrying provisioning…' : 'Provisioning… (creating tenant + dashboard key)');

          const templateOk = Boolean(w.data.templateId);
          const providerOk = Boolean(w.data.provider);
          const presetOk = Boolean(w.data.modelPreset);
          const keyOk = Boolean(w.data.openaiApiKey || w.data.anthropicApiKey || w.data.openrouterApiKey || w.data.kimiApiKey);

          if (!templateOk || !providerOk || !presetOk || !keyOk) {
            await sendMessage(chatId, 'You’re missing some setup steps. Tap Status and finish the missing items.');
            return;
          }

          // Either create a new tenant record, or retry the most recent failed/provisioning tenant.
          let tenantId: string;
          let dashboardPort: number;

          if (data === 'provision:retry') {
            const last = db
              .prepare(
                `SELECT tenant_id, dashboard_port
                 FROM tenants
                 WHERE telegram_user_id = ?
                   AND status IN ('provisioning','failed')
                   AND (deleted_at IS NULL)
                 ORDER BY created_at DESC
                 LIMIT 1`
              )
              .get(telegramUserId) as any;
            if (!last?.tenant_id || !last?.dashboard_port) {
              await sendMessage(chatId, 'No failed provisioning found to retry. Tap Status → Provision agent.');
              return;
            }
            tenantId = String(last.tenant_id);
            dashboardPort = Number(last.dashboard_port);
          } else {
            tenantId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

            // Allocate a unique dashboard port (avoid collisions)
            function allocateDashboardPort(): number {
              const used = new Set<number>(
                (db.prepare("SELECT dashboard_port FROM tenants WHERE dashboard_port IS NOT NULL AND (status IS NULL OR status != 'deleted')").all() as any[])
                  .map((r) => Number(r.dashboard_port))
                  .filter((n) => Number.isFinite(n))
              );
              for (let i = 0; i < 2000; i++) {
                const p = 19000 + Math.floor(Math.random() * 1000);
                if (!used.has(p)) return p;
              }
              // fallback: linear scan
              for (let p = 19000; p < 20000; p++) if (!used.has(p)) return p;
              throw new Error('No free dashboard ports available (19000-19999).');
            }

            dashboardPort = allocateDashboardPort();

            db.prepare(
              `INSERT INTO tenants(tenant_id, telegram_user_id, agent_name, bot_username, template_id, provider, model_preset, dashboard_port, gateway_token, telegram_token_fp, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              tenantId,
              telegramUserId,
              w.data.agentName ?? null,
              w.data.botUsername ?? null,
              w.data.templateId ?? null,
              w.data.provider ?? null,
              w.data.modelPreset ?? null,
              dashboardPort,
              null,
              w.data.botTokenFp ?? null,
              'provisioning'
            );
          }

          // Record context immediately so retries/pairing have the tenant id.
          setWizard(telegramUserId, 'await_pairing_code', {
            ...w.data,
            lastTenantId: tenantId,
            lastDashboardPort: dashboardPort
          });

          // Mark status provisioning on retry too
          db.prepare(`UPDATE tenants SET status='provisioning' WHERE tenant_id = ?`).run(tenantId);

          // Generate a one-time SSH key for dashboard tunnel
          // (On retry, generate a new key and add it; old keys may remain in authorized_keys.)
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfsp-dash-'));
          const keyBase = path.join(tmpDir, `hfsp_${tenantId}`);
          execFileSync('ssh-keygen', ['-t', 'ed25519', '-C', tenantId, '-f', keyBase, '-N', ''], { stdio: 'ignore' });
          const pub = fs.readFileSync(`${keyBase}.pub`, 'utf8').trim();

          await sendMessage(chatId, `Tenant: ${tenantId}`);

          // Install dash tunnel key automatically on tenant VPS via restricted sudo helper.
          const out = sshTenant(`sudo /usr/local/bin/hfsp_dash_allow_key ${dashboardPort} ${shSingleQuote(pub)}`);
          if (!out.includes('OK')) throw new Error(`Tenant VPS key install unexpected output: ${out}`);

          // Ensure tenant directory exists (requires one-time chown of /opt/hfsp to tenant).
          const tenantDir = `${TENANT_VPS_BASEDIR}/${tenantId}`;
          const workspaceDir = `${tenantDir}/workspace`;
          const secretsDir = `${tenantDir}/secrets`;
          sshTenant(`mkdir -p ${workspaceDir} ${secretsDir}`);

          // Write tenant secrets
          const telegramToken = (w.data.botToken ?? '').trim();
          const telegramTokenB64 = Buffer.from(telegramToken + '\n').toString('base64');
          sshTenant(`bash -lc 'echo ${shSingleQuote(telegramTokenB64)} | base64 -d > ${secretsDir}/telegram.token'`);

          if (w.data.provider === 'openai' && w.data.openaiApiKey) {
            const k = Buffer.from(w.data.openaiApiKey.trim() + '\n').toString('base64');
            sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/openai.key'`);
          }
          if (w.data.provider === 'anthropic' && w.data.anthropicApiKey) {
            const k = Buffer.from(w.data.anthropicApiKey.trim() + '\n').toString('base64');
            sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/anthropic.key'`);
          }
          if (w.data.provider === 'openrouter' && w.data.openrouterApiKey) {
            const k = Buffer.from(w.data.openrouterApiKey.trim() + '\n').toString('base64');
            sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/openrouter.key'`);
          }
          if (w.data.provider === 'kimi' && w.data.kimiApiKey) {
            const k = Buffer.from(w.data.kimiApiKey.trim() + '\n').toString('base64');
            sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/moonshot.key'`);
          }

          // Write tenant openclaw.json
          // Reuse existing gateway token if present; otherwise generate.
          const row0 = db.prepare(`SELECT gateway_token FROM tenants WHERE tenant_id = ?`).get(tenantId) as any;
          const row = unprotectTenantRowTokens(row0);
          const gatewayToken = row?.gateway_token ? String(row.gateway_token) : Buffer.from(`${tenantId}:${Math.random().toString(36).slice(2)}`).toString('hex').slice(0, 48);
          // persist token for Advanced dashboard access instructions (encrypted)
          db.prepare(`UPDATE tenants SET gateway_token = ? WHERE tenant_id = ?`).run(encryptString(gatewayToken), tenantId);
          // Map 'fast'/'smart' preset → real OpenClaw model ID per provider
          const WIZARD_MODEL_MAP: Record<string, Record<string, string>> = {
            anthropic:  { fast: 'anthropic/claude-3-5-sonnet', smart: 'anthropic/claude-3-opus' },
            openai:     { fast: 'openai/gpt-3.5-turbo',        smart: 'openai/gpt-4o' },
            kimi:       { fast: 'moonshot/moonshot-v1-8k',     smart: 'moonshot/moonshot-v1-128k' },
            openrouter: { fast: 'openrouter/auto',              smart: 'openrouter/auto' },
          };
          const resolvedModel = WIZARD_MODEL_MAP[w.data.provider ?? '']?.[w.data.modelPreset ?? ''] ?? undefined;
          // Build auth profile so OpenClaw knows which credentials profile to use
          const wizardAuthProfile: Record<string, any> = {};
          if (w.data.provider === 'anthropic') {
            wizardAuthProfile['anthropic:default'] = { provider: 'anthropic', mode: 'api_key' };
          } else if (w.data.provider === 'openai') {
            wizardAuthProfile['openai:default'] = { provider: 'openai', mode: 'api_key' };
          } else if (w.data.provider === 'openrouter') {
            wizardAuthProfile['openrouter:default'] = { provider: 'openrouter', mode: 'api_key' };
          } else if (w.data.provider === 'kimi') {
            wizardAuthProfile['moonshot:default'] = { provider: 'moonshot', mode: 'api_key' };
          }
          const openclawConfig = {
            agents: {
              defaults: {
                workspace: '/tenant/workspace'
              },
              list: [
                {
                  id: 'main',
                  default: true,
                  name: w.data.templateId === 'ops_starter' ? 'Ops Starter' : 'Blank',
                  workspace: '/tenant/workspace',
                  model: resolvedModel,
                  identity: { name: w.data.agentName ?? 'Agent', emoji: '🧭' }
                }
              ]
            },
            ...(Object.keys(wizardAuthProfile).length > 0 ? { auth: { profiles: wizardAuthProfile } } : {}),
            gateway: {
              port: dashboardPort,
              bind: 'lan',
              mode: 'local',
              auth: { mode: 'token', token: gatewayToken },
              controlUi: {
                enabled: true,
                allowedOrigins: [`http://localhost:${dashboardPort}`, `http://127.0.0.1:${dashboardPort}`]
              }
            },
            plugins: { entries: { telegram: { enabled: true } } },
            channels: {
              telegram: {
                enabled: true,
                // Configure account directly (avoid doctor migration from single-account fields)
                accounts: {
                  default: {
                    enabled: true,
                    dmPolicy: 'pairing',
                    groupPolicy: 'disabled',
                    tokenFile: '/home/clawd/.openclaw/secrets/telegram.token',
                    streaming: 'off'
                  }
                }
              }
            },
            bindings: [
              { agentId: 'main', match: { channel: 'telegram', accountId: 'default' } }
            ]
          };

          const configB64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString('base64');
          sshTenant(`bash -lc 'echo ${shSingleQuote(configB64)} | base64 -d > ${tenantDir}/openclaw.json'`);

          // Start tenant container (dashboard bound to host loopback only)
          const containerName = `hfsp_${tenantId}`;
          // Stop/remove existing container if present
          sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);

          const runParts = [
            'docker run -d',
            `--name ${containerName}`,
            '--restart unless-stopped',
            `-p 127.0.0.1:${dashboardPort}:${dashboardPort}`,
            `-v ${workspaceDir}:/tenant/workspace`,
            `-v ${tenantDir}/openclaw.json:/home/clawd/.openclaw/openclaw.json:ro`,
            `-v ${secretsDir}:/home/clawd/.openclaw/secrets:ro`,
          ];
          if (w.data.provider === 'openai') {
            runParts.push(`-e OPENAI_API_KEY="$(cat ${secretsDir}/openai.key | tr -d '\n\r')"`);
          } else if (w.data.provider === 'anthropic') {
            runParts.push(`-e ANTHROPIC_API_KEY="$(cat ${secretsDir}/anthropic.key | tr -d '\n\r')"`);
          } else if (w.data.provider === 'openrouter') {
            runParts.push(`-e OPENROUTER_API_KEY="$(cat ${secretsDir}/openrouter.key | tr -d '\n\r')"`);
          } else if (w.data.provider === 'kimi') {
            runParts.push(`-e MOONSHOT_API_KEY="$(cat ${secretsDir}/moonshot.key | tr -d '\n\r')"`);
          }
          runParts.push(TENANT_RUNTIME_IMAGE);
          const runCmd = runParts.join(' ');

          sshTenant(runCmd);

          // Fix workspace permissions (host bind-mount is owned by user `tenant`; container runs as uid 10001).
          // Do it inside the container as root so it works without requiring sudo/root on the tenant VPS.
          sshTenant(`docker exec -u root ${containerName} bash -lc ${shSingleQuote('chown -R 10001:10001 /tenant/workspace || true; chmod -R u+rwX /tenant/workspace || true')}`);

          // Save last tenant info for pairing + Advanced dashboard access
          setWizard(telegramUserId, 'await_pairing_code', {
            ...w.data,
            lastTenantId: tenantId,
            lastDashboardPort: dashboardPort,
            lastGatewayToken: gatewayToken
          });

          // Send dashboard key as a document, but do NOT show any SSH commands unless the user taps Advanced.
          await sendDocument(chatId, keyBase, `hfsp_${tenantId}.key`, 'Dashboard SSH key (keep it private). You’ll only need this if you choose Dashboard access (Advanced).');

          const botLink = w.data.botUsername ? `https://t.me/${w.data.botUsername}` : undefined;

          await sendMessage(
            chatId,
            [
              'Provisioned ✅',
              '',
              'Next: Pair your bot (required).',
              '1) Open your bot and send /start',
              '2) It will show a pairing code',
              '3) Paste the pairing code here'
            ].join('\n'),
            {
              reply_markup: {
                inline_keyboard: [
                  botLink ? [{ text: 'Open your bot', url: botLink }] : [{ text: 'Open your bot', callback_data: 'noop' }],
                  [{ text: 'Dashboard access (Advanced)', callback_data: 'advanced:dashboard' }],
                  [{ text: 'Cancel', callback_data: 'flow:cancel' }]
                ]
              }
            }
          );

          db.prepare(`UPDATE tenants SET status='active' WHERE tenant_id = ?`).run(tenantId);

          // Do not show SSH/tunnel commands by default.
          return;
        } catch (err) {
          console.error('Provision error', err);
          // best-effort: mark last tenant as failed
          try {
            const w2 = getWizard(telegramUserId);
            if (w2.data.lastTenantId) {
              db.prepare(`UPDATE tenants SET status='failed' WHERE tenant_id = ?`).run(w2.data.lastTenantId);
            }
          } catch {}
          await sendMessage(
            chatId,
            `Provisioning failed: ${(err as Error)?.message ?? String(err)}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Retry provisioning', callback_data: 'provision:retry' }],
                  [{ text: 'Cancel', callback_data: 'flow:cancel' }]
                ]
              }
            }
          );
          return;
        }
      }

      // Help
      if (data === 'help:back') {
        const w2 = getWizard(telegramUserId);
        setWizard(telegramUserId, w2.step, { ...w2.data, helpMode: false });
        await sendMessage(chatId, 'Back to setup.');
        await sendMenu(chatId);
        return;
      }

      if (data === 'help:common') {
        await sendMessage(
          chatId,
          [
            'Common issues:',
            '',
            '1) Pairing failed because you pasted your Telegram user id',
            '   → Paste the 8-character pairing code (like A52X7ABQ), not 750030681.',
            '',
            '2) Telegram error 409 “terminated by other getUpdates request”',
            '   → You reused the same BotFather token in multiple tenants. Create a new bot per agent.',
            '',
            '3) “Something went wrong while processing your request”',
            '   → Usually the tenant runtime hit a config/auth/permission issue. Tell me the exact message and I’ll fix it.',
            '',
            'Tap Back when you’re ready.'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [[{ text: 'Back to setup', callback_data: 'help:back' }]]
            }
          }
        );
        return;
      }

      // Agents: list + pick
      if (data === 'agents:list' || data === 'agents:list_archived') {
        await renderAgentsPage({
          chatId,
          telegramUserId,
          archived: data === 'agents:list_archived',
          offset: 0
        });
        return;
      }

      // Pagination callbacks
      if (data?.startsWith('agents:active:')) {
        const off = Number(data.split(':')[2] ?? '0');
        await renderAgentsPage({ chatId, telegramUserId, archived: false, offset: Number.isFinite(off) ? off : 0 });
        return;
      }
      if (data?.startsWith('agents:archived:')) {
        const off = Number(data.split(':')[2] ?? '0');
        await renderAgentsPage({ chatId, telegramUserId, archived: true, offset: Number.isFinite(off) ? off : 0 });
        return;
      }

      if (data === 'agents:pick') {
        await sendMessage(chatId, 'Tap “My agents” to pick from your list.', {
          reply_markup: { inline_keyboard: [[{ text: 'My agents', callback_data: 'agents:list' }]] }
        });
        return;
      }

      if (data?.startsWith('agent:details:')) {
        const tenantId = data.split(':').slice(2).join(':');
        let r = db
          .prepare(
            `SELECT tenant_id, agent_name, bot_username, provider, model_preset, dashboard_port, gateway_token, status, created_at
             FROM tenants
             WHERE telegram_user_id = ? AND tenant_id = ? AND (status IS NULL OR status != 'deleted')`
          )
          .get(telegramUserId, tenantId) as any;

        // Backfill bot username for older tenants (created before we stored bot_username)
        if (r && !r.bot_username) {
          try {
            const containerName = `hfsp_${tenantId}`;
            const out = sshTenant(`docker exec -u clawd ${containerName} bash -lc ${shSingleQuote('HOME=/home/clawd openclaw channels status --probe')}`);
            const m = out.match(/bot:@([A-Za-z0-9_]+)/);
            if (m?.[1]) {
              const uname = m[1];
              db.prepare(`UPDATE tenants SET bot_username = ? WHERE tenant_id = ?`).run(uname, tenantId);
              r = { ...r, bot_username: uname };
            }
          } catch {
            // ignore; keep Bot: —
          }
        }

        if (!r) {
          await sendMessage(chatId, 'Agent not found.');
          return;
        }

        const botLink = r.bot_username ? `https://t.me/${r.bot_username}` : undefined;
        const providerLabel = r.provider === 'openai' ? 'OpenAI' : r.provider === 'anthropic' ? 'Claude (Anthropic)' : r.provider === 'openrouter' ? 'OpenRouter' : r.provider === 'kimi' ? 'Kimi (Moonshot)' : r.provider ?? '—';

        const statusLabel = r.status === 'archived' ? 'archived' : r.status === 'stopped' ? 'stopped' : 'active';

        await sendMessage(
          chatId,
          [
            'Agent details:',
            `• Name: ${r.agent_name ?? '—'}`,
            `• Bot: ${r.bot_username ? '@' + r.bot_username : '—'}`,
            `• Provider: ${providerLabel}`,
            `• Preset: ${r.model_preset ?? '—'}`,
            `• Status: ${statusLabel}`,
            `• Tenant: ${r.tenant_id}`,
            `• Created: ${r.created_at}`
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                botLink ? [{ text: 'Open bot', url: botLink }] : [{ text: 'Open bot', callback_data: 'noop' }],
                [{ text: 'Dashboard (Advanced)', callback_data: `agent:dashboard:${r.tenant_id}` }],
                [{ text: 'Health check', callback_data: `agent:health:${r.tenant_id}` }],
                [{ text: 'Stop (Advanced)', callback_data: `agent:stop_confirm:${r.tenant_id}` }, { text: 'Restart (Advanced)', callback_data: `agent:restart:${r.tenant_id}` }],
                statusLabel === 'archived'
                  ? [{ text: 'Unarchive', callback_data: `agent:unarchive:${r.tenant_id}` }]
                  : [{ text: 'Archive', callback_data: `agent:archive:${r.tenant_id}` }],
                [{ text: 'Delete…', callback_data: `agent:delete_confirm:${r.tenant_id}` }],
                [{ text: 'Back to list', callback_data: statusLabel === 'archived' ? 'agents:list_archived' : 'agents:list' }]
              ]
            }
          }
        );
        return;
      }

      if (data?.startsWith('agent:archive:')) {
        const tenantId = data.split(':').slice(2).join(':');
        db.prepare(`UPDATE tenants SET status='archived', archived_at=datetime('now') WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
        await sendMessage(chatId, 'Archived ✅');
        // jump back to archived list
        await sendMessage(chatId, 'Archived agents:', { reply_markup: { inline_keyboard: [[{ text: 'Show archived', callback_data: 'agents:list_archived' }], [{ text: 'Back to active', callback_data: 'agents:list' }]] } });
        return;
      }

      if (data?.startsWith('agent:unarchive:')) {
        const tenantId = data.split(':').slice(2).join(':');
        db.prepare(`UPDATE tenants SET status='active', archived_at=NULL WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
        await sendMessage(chatId, 'Unarchived ✅');
        // jump back to active list
        await sendMessage(chatId, 'Active agents:', { reply_markup: { inline_keyboard: [[{ text: 'My agents', callback_data: 'agents:list' }], [{ text: 'Show archived', callback_data: 'agents:list_archived' }]] } });
        return;
      }

      if (data?.startsWith('agent:health:')) {
        const tenantId = data.split(':').slice(2).join(':');
        const containerName = `hfsp_${tenantId}`;
        await sendMessage(chatId, 'Running health check…');
        try {
          const out = sshTenant(`docker exec -u clawd ${containerName} bash -lc ${shSingleQuote('HOME=/home/clawd openclaw channels status --probe')}`);
          await sendMessage(chatId, `Health check ✅\n\n${out}`);
        } catch (err) {
          console.error('health check failed', err);
          await sendMessage(chatId, `Health check failed: ${(err as Error)?.message ?? String(err)}`);
        }
        return;
      }

      if (data?.startsWith('agent:stop_confirm:')) {
        const tenantId = data.split(':').slice(2).join(':');
        await sendMessage(
          chatId,
          [
            'Stop runtime (Advanced)',
            '',
            'This will stop the agent container. Your bot will stop responding until you restart it.',
            '',
            'Are you sure?'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Stop now', callback_data: `agent:stop_do:${tenantId}` }],
                [{ text: 'Cancel', callback_data: `agent:details:${tenantId}` }]
              ]
            }
          }
        );
        return;
      }

      if (data?.startsWith('agent:stop_do:')) {
        const tenantId = data.split(':').slice(2).join(':');
        const containerName = `hfsp_${tenantId}`;
        try {
          sshTenant(`docker stop ${containerName} >/dev/null 2>&1 || true`);
          db.prepare(`UPDATE tenants SET status='stopped' WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
          await sendMessage(chatId, 'Stopped ✅');
        } catch (err) {
          console.error('stop failed', err);
          await sendMessage(chatId, `Stop failed: ${(err as Error)?.message ?? String(err)}`);
        }
        await sendMessage(chatId, 'Back:', { reply_markup: { inline_keyboard: [[{ text: 'My agents', callback_data: 'agents:list' }]] } });
        return;
      }

      if (data?.startsWith('agent:restart:')) {
        const tenantId = data.split(':').slice(2).join(':');
        const containerName = `hfsp_${tenantId}`;
        await sendMessage(chatId, 'Restarting…');
        try {
          sshTenant(`docker restart ${containerName} >/dev/null 2>&1 || true`);
          db.prepare(`UPDATE tenants SET status='active' WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
          await sendMessage(chatId, 'Restarted ✅');
        } catch (err) {
          console.error('restart failed', err);
          await sendMessage(chatId, `Restart failed: ${(err as Error)?.message ?? String(err)}`);
        }
        await sendMessage(chatId, 'Back:', { reply_markup: { inline_keyboard: [[{ text: 'My agents', callback_data: 'agents:list' }]] } });
        return;
      }

      if (data?.startsWith('agent:delete_confirm:')) {
        const tenantId = data.split(':').slice(2).join(':');
        await sendMessage(
          chatId,
          [
            'Delete agent (Danger)',
            '',
            'This will stop and remove the tenant container and move its files to a trash folder on the tenant VPS.',
            'You can’t use this agent afterwards unless we restore it.',
            '',
            'Are you sure?'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Delete permanently', callback_data: `agent:delete_do:${tenantId}` }],
                [{ text: 'Cancel', callback_data: `agent:details:${tenantId}` }]
              ]
            }
          }
        );
        return;
      }

      if (data?.startsWith('agent:delete_do:')) {
        const tenantId = data.split(':').slice(2).join(':');
        const containerName = `hfsp_${tenantId}`;
        const tenantDir = `${TENANT_VPS_BASEDIR}/${tenantId}`;
        const trashDir = `${TENANT_VPS_BASEDIR}/.trash/${tenantId}-${Date.now()}`;
        try {
          // best-effort stop/remove container
          sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);
          // move tenant dir to trash for recoverability
          sshTenant(`mkdir -p ${TENANT_VPS_BASEDIR}/.trash && (mv ${tenantDir} ${trashDir} 2>/dev/null || true)`);
          db.prepare(`UPDATE tenants SET status='deleted', deleted_at=datetime('now') WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
          await sendMessage(chatId, 'Deleted ✅');
          await sendMessage(chatId, 'Back to your agents:', { reply_markup: { inline_keyboard: [[{ text: 'My agents', callback_data: 'agents:list' }], [{ text: 'Show archived', callback_data: 'agents:list_archived' }]] } });
        } catch (err) {
          console.error('delete failed', err);
          await sendMessage(chatId, `Delete failed: ${(err as Error)?.message ?? String(err)}`);
        }
        return;
      }

      if (data?.startsWith('agent:dashboard:')) {
        const tenantId = data.split(':').slice(2).join(':');
        const r0 = db
          .prepare(
            `SELECT tenant_id, dashboard_port, gateway_token
             FROM tenants
             WHERE telegram_user_id = ? AND tenant_id = ? AND (status IS NULL OR status != 'deleted')`
          )
          .get(telegramUserId, tenantId) as any;
        const r = unprotectTenantRowTokens(r0);

        if (!r?.dashboard_port || !r?.gateway_token) {
          await sendMessage(chatId, 'Missing dashboard details for this agent.');
          return;
        }

        await sendMessage(
          chatId,
          [
            'Dashboard access (Advanced)',
            '',
            'Choose a method:',
            '',
            '• One-liner (recommended): copy/paste into Terminal (no Gatekeeper prompts)',
            '• Launcher file: download & run'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'One-liner (recommended)', callback_data: `agent:dashboard_oneliner:${tenantId}` }],
                [{ text: 'Launcher file…', callback_data: `agent:dashboard_launcher:${tenantId}` }],
                [{ text: 'Back', callback_data: `agent:details:${tenantId}` }]
              ]
            }
          }
        );
        return;
      }

      if (data?.startsWith('agent:dashboard_oneliner:')) {
        const tenantId = data.split(':').slice(2).join(':');
        await sendMessage(
          chatId,
          'Where did you save the SSH key file?',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Downloads (recommended)', callback_data: `agent:dashboard_oneliner_loc:${tenantId}:Downloads` }],
                [{ text: 'Desktop', callback_data: `agent:dashboard_oneliner_loc:${tenantId}:Desktop` }],
                [{ text: 'I’m not sure', callback_data: `agent:dashboard_oneliner_loc:${tenantId}:Find` }],
                [{ text: 'Back', callback_data: `agent:dashboard:${tenantId}` }]
              ]
            }
          }
        );
        return;
      }

      if (data?.startsWith('agent:dashboard_oneliner_loc:')) {
        const parts = data.split(':');
        const tenantId = parts[2] ?? '';
        const loc = parts[3] ?? 'Downloads';

        const r0 = db
          .prepare(
            `SELECT tenant_id, dashboard_port, gateway_token
             FROM tenants
             WHERE telegram_user_id = ? AND tenant_id = ? AND (status IS NULL OR status != 'deleted')`
          )
          .get(telegramUserId, tenantId) as any;
        const r = unprotectTenantRowTokens(r0);

        if (!r?.dashboard_port || !r?.gateway_token) {
          await sendMessage(chatId, 'Missing dashboard details for this agent.');
          return;
        }

        const port = Number(r.dashboard_port);
        const url = `http://127.0.0.1:${port}`;
        const keyFile = `hfsp_${tenantId}.key`;

        let cdPath = '~/Downloads';
        if (loc === 'Desktop') cdPath = '~/Desktop';

        const cmd = `cd ${cdPath} && chmod 600 ${keyFile} && ssh -i ${keyFile} -N -L ${port}:127.0.0.1:${port} dash@${TENANT_VPS_HOST}`;
        const findCmd = `find ~ -maxdepth 2 -name ${keyFile} 2>/dev/null`;

        await sendMessage(
          chatId,
          [
            'Copy/paste this into Terminal (Mac/Linux):',
            cmd,
            '',
            `Then open: ${url}`,
            '',
            'Dashboard token (if prompted):',
            String(r.gateway_token),
            '',
            loc === 'Find' ? `If you can’t find the key, run:\n${findCmd}` : ''
          ].filter(Boolean).join('\n')
        );
        return;
      }

      if (data?.startsWith('agent:dashboard_launcher:')) {
        const tenantId = data.split(':').slice(2).join(':');
        await sendMessage(chatId, 'Choose your computer:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Mac', callback_data: `agent:dashboard_os:${tenantId}:mac` }],
              [{ text: 'Windows', callback_data: `agent:dashboard_os:${tenantId}:windows` }],
              [{ text: 'Linux', callback_data: `agent:dashboard_os:${tenantId}:linux` }],
              [{ text: 'Back', callback_data: `agent:details:${tenantId}` }]
            ]
          }
        });
        return;
      }

      // Advanced: dashboard access instructions (hidden behind button)
      if (data === 'advanced:dashboard') {
        const w2 = getWizard(telegramUserId);
        const tenantId = w2.data.lastTenantId;
        const port = w2.data.lastDashboardPort;
        const token = w2.data.lastGatewayToken;

        if (!tenantId || !port || !token) {
          await sendMessage(chatId, 'I don’t have dashboard details in the current setup flow. Tap Status → Provision agent again.');
          return;
        }

        await sendMessage(
          chatId,
          [
            'Dashboard access (Advanced)',
            '',
            'Choose your computer:',
            '',
            'I’ll send you a 1-click launcher (no typing).'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Mac', callback_data: `advanced:dashboard:os:mac` }],
                [{ text: 'Windows', callback_data: `advanced:dashboard:os:windows` }],
                [{ text: 'Linux', callback_data: `advanced:dashboard:os:linux` }],
                [{ text: 'Back', callback_data: 'flow:back' }]
              ]
            }
          }
        );
        return;
      }

      const ensuredChatId: number = chatId;
      async function sendDashboardLauncher(params: { tenantId: string; port: number; token: string; osKey: string }) {
        const { tenantId, port, token, osKey } = params;
        const keyFile = `hfsp_${tenantId}.key`;
        const url = `http://127.0.0.1:${port}`;

        let filename = '';
        let content = '';
        let caption = '';

        if (osKey === 'mac') {
          filename = `connect-dashboard-${tenantId}.command`;
          content = [
            '#!/usr/bin/env bash',
            'set -euo pipefail',
            '',
            `cd "$(dirname "$0")"`,
            `chmod 600 "${keyFile}" 2>/dev/null || true`,
            `echo "Starting tunnel… Keep this window open."`,
            `echo "Then open: ${url}"`,
            `ssh -i "./${keyFile}" -N -L ${port}:127.0.0.1:${port} dash@${TENANT_VPS_HOST}`
          ].join('\n');
          caption = `Mac launcher. Put it in the same folder as ${keyFile}, then double-click.`;
        } else if (osKey === 'windows') {
          filename = `connect-dashboard-${tenantId}.ps1`;
          content = [
            '$ErrorActionPreference = "Stop"',
            `$here = Split-Path -Parent $MyInvocation.MyCommand.Path`,
            'Set-Location $here',
            `Write-Host "Starting tunnel… Keep this window open."`,
            `Write-Host "Then open: ${url}"`,
            `ssh -i .\\${keyFile} -N -L ${port}:127.0.0.1:${port} dash@${TENANT_VPS_HOST}`
          ].join('\r\n');
          caption = `Windows launcher. Save it next to ${keyFile}, right-click → Run with PowerShell.`;
        } else {
          filename = `connect-dashboard-${tenantId}.sh`;
          content = [
            '#!/usr/bin/env bash',
            'set -euo pipefail',
            '',
            `cd "$(dirname "$0")"`,
            `chmod 600 "${keyFile}" 2>/dev/null || true`,
            `echo "Starting tunnel… Keep this window open."`,
            `echo "Then open: ${url}"`,
            `ssh -i "./${keyFile}" -N -L ${port}:127.0.0.1:${port} dash@${TENANT_VPS_HOST}`
          ].join('\n');
          caption = `Linux launcher. Save it next to ${keyFile}, then run: chmod +x ${filename} && ./${filename}`;
        }

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfsp-dash-launch-'));
        const outPath = path.join(tmpDir, filename);
        fs.writeFileSync(outPath, content, { encoding: 'utf8', mode: 0o600 });

        await sendDocument(ensuredChatId, outPath, filename, caption);

        await sendMessage(
          ensuredChatId,
          [
            'Dashboard token (if prompted):',
            token,
            '',
            `Open after tunnel starts: ${url}`
          ].join('\n')
        );
      }

      if (data?.startsWith('advanced:dashboard:os:')) {
        const osKey = data.split(':')[3];
        const w2 = getWizard(telegramUserId);
        const tenantId = w2.data.lastTenantId;
        const port = w2.data.lastDashboardPort;
        const token = w2.data.lastGatewayToken;
        if (!tenantId || !port || !token) {
          await sendMessage(chatId, 'Missing dashboard context. Tap Status → Provision agent again.');
          return;
        }

        await sendDashboardLauncher({ tenantId, port, token, osKey });
        return;
      }

      if (data?.startsWith('agent:dashboard_os:')) {
        const parts = data.split(':');
        // agent:dashboard_os:<tenantId>:<os>
        const tenantId = parts[2] ?? '';
        const osKey = parts[3] ?? '';

        const r0 = db
          .prepare(
            `SELECT tenant_id, dashboard_port, gateway_token
             FROM tenants
             WHERE telegram_user_id = ? AND tenant_id = ? AND (status IS NULL OR status != 'deleted')`
          )
          .get(telegramUserId, tenantId) as any;
        const r = unprotectTenantRowTokens(r0);

        if (!r?.dashboard_port || !r?.gateway_token) {
          await sendMessage(chatId, 'Missing dashboard details for this agent.');
          return;
        }

        await sendDashboardLauncher({ tenantId, port: Number(r.dashboard_port), token: String(r.gateway_token), osKey });
        return;
      }

      // Unknown callback
      await sendMenu(chatId);
      return;
    }

    if (!text) {
      await sendMenu(chatId);
      return;
    }

    const norm = text.trim().toLowerCase();
    const w = getWizard(telegramUserId);

    // Map button labels to commands
    const cmd =
      norm === 'create agent' ? 'create' :
      norm === 'my agents' ? 'my_agents' :
      norm === 'help' ? 'help' :
      norm === 'status' ? 'status' :
      norm === 'cancel' ? 'cancel' :
      norm;

    if (cmd.startsWith('/start')) {
      await sendMenu(chatId);
      return;
    }

    if (cmd.startsWith('/app')) {
      await handleAppCommand(chatId);
      return;
    }


    if (cmd === 'cancel') {
      clearWizard(telegramUserId);
      await sendMessage(chatId, 'Cancelled. Use the menu buttons when you’re ready.');
      await sendMenu(chatId);
      return;
    }

    if (cmd === 'help') {
      // Enter help chat mode without losing wizard progress.
      setWizard(telegramUserId, w.step, { ...w.data, helpMode: true });
      await sendMessage(
        chatId,
        [
          'Help mode — ask me anything about setup.',
          '',
          'Common things I can help with:',
          '• BotFather token / username',
          '• Pairing code vs Telegram user id',
          '• “Something went wrong” errors',
          '• Dashboard (Advanced)',
          '',
          'Type your question now.'
        ].join('\n'),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Common issues', callback_data: 'help:common' }],
              [{ text: 'Back to setup', callback_data: 'help:back' }],
              [{ text: 'Cancel', callback_data: 'flow:cancel' }]
            ]
          }
        }
      );
      return;
    }

    if (cmd === 'my_agents') {
      await renderAgentsPage({ chatId, telegramUserId, archived: false, offset: 0 });
      return;
    }

    if (cmd === 'status') {
      const hasKey = Boolean(w.data.openaiApiKey || w.data.anthropicApiKey);
      const providerLabel = w.data.provider === 'openai' ? 'OpenAI' : w.data.provider === 'anthropic' ? 'Claude (Anthropic)' : w.data.provider === 'openrouter' ? 'OpenRouter' : w.data.provider === 'kimi' ? 'Kimi (Moonshot)' : '—';
      const templateLabel = w.data.templateId === 'blank' ? 'Blank' : w.data.templateId === 'ops_starter' ? 'Ops Starter' : '—';
      const presetLabel = w.data.modelPreset ? (w.data.modelPreset === 'fast' ? 'Fast' : 'Smart') : '—';

      // Also show how many agents exist
      const agentCount = (db.prepare("SELECT COUNT(1) AS c FROM tenants WHERE telegram_user_id = ? AND (status IS NULL OR status != 'deleted')").get(telegramUserId) as any)?.c ?? 0;

      const lastFailed = db
        .prepare(
          `SELECT tenant_id, status, created_at
           FROM tenants
           WHERE telegram_user_id = ?
             AND status IN ('failed','provisioning')
             AND (deleted_at IS NULL)
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(telegramUserId) as any;

      const statusLines: string[] = [
        'Your setup so far (current draft):',
        `• Agent name: ${w.data.agentName ?? '—'}`,
        `• Template: ${templateLabel}`,
        `• Provider: ${providerLabel}`,
        `• Key: ${hasKey ? 'saved ✅' : 'missing'}`,
        `• Preset: ${presetLabel}`,
        `• Current step: ${w.step}`,
        '',
        `Saved agents: ${agentCount}`
      ];
      if (lastFailed?.tenant_id) {
        statusLines.push('', `⚠️ Last provisioning: ${lastFailed.status} (${lastFailed.tenant_id})`);
      }

      const inline: any[] = [[{ text: 'My agents', callback_data: 'agents:list' }]];

      // Resume setup: route back to the right UI for the current wizard step
      if (w.step !== 'idle') {
        inline.push([{ text: 'Resume setup', callback_data: 'flow:resume' }]);
      }

      if (lastFailed?.tenant_id) inline.push([{ text: 'Retry provisioning', callback_data: 'provision:retry' }]);
      inline.push([{ text: 'Provision agent', callback_data: 'provision:start' }]);
      inline.push([{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]);

      await sendMessage(chatId, statusLines.join('\n'), {
        reply_markup: { inline_keyboard: inline }
      });
      return;
    }

    if (cmd === 'create') {
      // Always restart the wizard from scratch to avoid getting stuck.
      clearWizard(telegramUserId);
      setWizard(telegramUserId, 'setup_intro', { history: [] });
      await renderSetupIntro(chatId);
      return;
    }

    if (w.step === 'await_agent_name') {
      const agentName = text.trim().slice(0, 60);
      transition(telegramUserId, w.step, 'botfather_helper', { ...w.data, agentName });
      await renderBotFatherHelper(chatId);
      return;
    }

    if (w.step === 'await_bot_token') {
      const token = text.trim();
      if (!token.includes(':') || token.length < 20) {
        await sendMessage(chatId, 'That token does not look valid. Paste the full BotFather token.', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
          }
        });
        return;
      }

      const fp = tokenFingerprint(token);
      const existing = db
        .prepare(
          `SELECT tenant_id, bot_username, created_at
           FROM tenants
           WHERE telegram_user_id = ?
             AND telegram_token_fp = ?
             AND (status IS NULL OR status != 'deleted')
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(telegramUserId, fp) as any;

      if (existing && !w.data.allowTokenReuse) {
        setWizard(telegramUserId, w.step, {
          ...w.data,
          botToken: token,
          botTokenFp: fp,
          botTokenConflictTenantId: existing.tenant_id
        });
        await sendMessage(
          chatId,
          [
            '⚠️ This bot token is already connected to an existing agent.',
            '',
            'If you reuse the same token, Telegram will break with a 409 polling conflict.',
            '',
            `Existing agent tenant: ${existing.tenant_id}${existing.bot_username ? ` (@${existing.bot_username})` : ''}`,
            '',
            'Recommended: create a NEW bot in @BotFather for each agent.'
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'I will create a new bot (recommended)', callback_data: 'token:retry' }],
                [{ text: 'Replace existing agent (stop old one)', callback_data: 'token:replace' }],
                [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
              ]
            }
          }
        );
        return;
      }

      // Auto-detect bot username via Telegram getMe (so user doesn't have to type it)
      const me = await telegramGetMe(token);
      if (me.ok && me.username) {
        transition(telegramUserId, w.step, 'await_template', {
          ...w.data,
          botToken: token,
          botTokenFp: fp,
          botTokenConflictTenantId: undefined,
          allowTokenReuse: false,
          botUsername: me.username
        });
        await sendMessage(chatId, `Nice — I found your bot: @${me.username}`);
        await sendMessage(chatId, 'Choose a template:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Blank', callback_data: 'template:blank' }],
              [{ text: 'Ops Starter', callback_data: 'template:ops_starter' }],
              [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
            ]
          }
        });
        return;
      }

      transition(telegramUserId, w.step, 'await_bot_username', { ...w.data, botToken: token, botTokenFp: fp, botTokenConflictTenantId: undefined, allowTokenReuse: false });
      await sendMessage(
        chatId,
        'What is your bot username? (example: @my_agent_bot or t.me/my_agent_bot)',
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]]
          }
        }
      );
      return;
    }

    if (w.step === 'await_bot_username') {
      const raw = text.trim();
      const cleaned = raw
        .replace(/^https?:\/\/t\.me\//i, '')
        .replace(/^@/, '')
        .trim();
      if (!/^[A-Za-z0-9_]{5,}$/.test(cleaned)) {
        await sendMessage(chatId, 'That doesn’t look like a Telegram bot username. Paste something like @my_agent_bot.');
        return;
      }
      transition(telegramUserId, w.step, 'await_template', { ...w.data, botUsername: cleaned });
      await sendMessage(chatId, 'Choose a template:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Blank', callback_data: 'template:blank' }],
            [{ text: 'Ops Starter', callback_data: 'template:ops_starter' }],
            [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
          ]
        }
      });
      return;
    }

    if (
      w.step === 'setup_intro' ||
      w.step === 'botfather_helper' ||
      w.step === 'await_template' ||
      w.step === 'choose_provider' ||
      w.step === 'connect_openai' ||
      w.step === 'await_model_preset'
    ) {
      // In these steps we expect button presses.
      await sendMenu(chatId);
      return;
    }

    if (w.step === 'await_openai_api_key') {
      const key = text.trim();
      if (key.length < 20) {
        await sendMessage(chatId, 'That key looks too short. Paste the full OpenAI API key.');
        return;
      }
      transition(telegramUserId, w.step, 'await_model_preset', { ...w.data, openaiApiKey: key });
      await renderChoosePreset(chatId);
      return;
    }

    if (w.step === 'await_anthropic_api_key') {
      const key = text.trim();
      if (key.length < 20) {
        await sendMessage(chatId, 'That key looks too short. Paste the full Anthropic API key.');
        return;
      }
      transition(telegramUserId, w.step, 'await_model_preset', { ...w.data, anthropicApiKey: key });
      await renderChoosePreset(chatId);
      return;
    }

    // Help chat mode: answer without advancing the wizard.
    if (w.data.helpMode) {
      const q = text.trim();
      const ql = q.toLowerCase();

      let answer: string;
      if (ql.includes('pair') || ql.includes('code')) {
        answer = 'Pairing tip: paste the 8-character pairing code (like A52X7ABQ). Don’t paste your Telegram user id (750030681).';
      } else if (ql.includes('409') || ql.includes('getupdates') || ql.includes('conflict')) {
        answer = 'Telegram 409 getUpdates conflict means the same BotFather token is being used by 2 runtimes. Create a new bot in BotFather for each agent/tenant.';
      } else if (ql.includes('dashboard') || ql.includes('ssh') || ql.includes('tunnel')) {
        answer = 'Dashboard is optional (Advanced). Use the “Dashboard access (Advanced)” button to see the tunnel command + token.';
      } else if (ql.includes('token') || ql.includes('botfather')) {
        answer = 'BotFather token should look like 123456:AA... Paste the full line. Keep it private.';
      } else {
        answer = 'Tell me what screen you’re on (or paste the exact error text). I’ll guide you to the next button / fix.';
      }

      await sendMessage(chatId, answer, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Common issues', callback_data: 'help:common' }],
            [{ text: 'Back to setup', callback_data: 'help:back' }]
          ]
        }
      });
      return;
    }

    if (w.step === 'await_pairing_code') {
      const code = text.trim().replace(/\s+/g, '').toUpperCase();
      if (!/^[A-Z0-9-]{6,20}$/.test(code)) {
        await sendMessage(chatId, 'That pairing code doesn’t look right. Paste the code exactly as shown by your bot.');
        return;
      }
      const tenantId = w.data.lastTenantId;
      if (!tenantId) {
        await sendMessage(chatId, 'Missing tenant context. Tap Status → Provision agent again.');
        return;
      }

      await sendMessage(chatId, 'Pairing…');
      try {
        const containerName = `hfsp_${tenantId}`;
        // Approve pairing inside tenant container as the runtime user.
        // Critical: ensure HOME points at /home/clawd so OpenClaw uses the mounted config.
        const approveInner = `HOME=/home/clawd openclaw pairing approve telegram ${code}`;
        const cmd = `docker exec -u clawd ${containerName} bash -lc ${shSingleQuote(approveInner)}`;
        const out = sshTenant(cmd);
        await sendMessage(chatId, `Paired ✅\n${out ? out : ''}`.trim());
        setWizard(telegramUserId, 'idle', { ...w.data });
        await sendMenu(chatId);
      } catch (err) {
        console.error('pairing approve failed', err);
        await sendMessage(chatId, `Pairing failed: ${(err as Error)?.message ?? String(err)}`);
      }
      return;
    }

    // If the user pasted a BotFather token out of sequence, guide them.
    if (text.includes(':') && text.length > 30 && w.step === 'idle') {
      await sendMessage(chatId, 'I see a bot token. Tap “Create agent” first so I know where to save it.');
      await renderSetupIntro(chatId);
      return;
    }

    // Default
    await sendMenu(chatId);
  } catch (err) {
    console.error('Webhook handler error', err);
  }
});


// ── EMAIL AUTHENTICATION ENDPOINTS ──────────────────────────────────────────
// POST /api/v1/auth/email-signup
app.post('/api/v1/auth/email-signup', async (req, res) => {
  try {
    const { email, password, firstName } = req.body as { email?: string; password?: string; firstName?: string };

    // Validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const existing = db.prepare('SELECT telegram_user_id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user with 14-day trial
    // telegram_user_id: synthetic negative ID for email-only users
    const syntheticTgId = -(Date.now());
    const userId = `u_email_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const trialStartedAt = new Date();
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);

    db.prepare(`
      INSERT INTO users (telegram_user_id, user_id, email, password_hash, subscription_tier, trial_started_at, trial_expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(syntheticTgId, userId, email, passwordHash, 'free_trial', trialStartedAt.toISOString(), trialExpiresAt.toISOString(), new Date().toISOString());

    // Generate JWT token
    const token = signToken({
      sub: userId,
      email: email,
      auth_method: 'email',
      subscription_tier: 'free_trial',
    }, 86400); // 24 hours

    // For MVP: log verification code to console
    const verificationCode = Math.random().toString().slice(2, 8);
    console.log(`\n📧 VERIFICATION CODE FOR ${email}: ${verificationCode}\n`);

    res.status(201).json({
      success: true,
      token,
      user: {
        userId,
        email,
        subscription: 'free_trial',
        trialExpiresAt,
      },
      message: 'Account created! 14-day trial activated.',
    });
  } catch (error) {
    console.error('Email signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/v1/auth/email-login
app.post('/api/v1/auth/email-login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare(`
      SELECT user_id, telegram_user_id, password_hash, subscription_tier, trial_expires_at
      FROM users
      WHERE email = ?
    `).get(email) as any;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if trial has expired
    const now = new Date();
    const trialExpired = user.trial_expires_at && new Date(user.trial_expires_at) < now;

    // Only allow login if: trial is active OR subscription is 'pro'
    if (trialExpired && user.subscription_tier !== 'pro') {
      return res.status(403).json({ error: 'Trial expired. Upgrade to Pro to continue.' });
    }

    // sub is user_id (string) if present, else fallback to telegram_user_id
    const sub = user.user_id || `tg_${user.telegram_user_id}`;
    const token = signToken({
      sub,
      email: email,
      auth_method: 'email',
      subscription_tier: user.subscription_tier,
    }, 86400);

    res.json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        email,
        subscription: user.subscription_tier,
      },
    });
  } catch (error) {
    console.error('Email login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── PHANTOM WALLET AUTHENTICATION ──────────────────────────────────────────

// POST /api/v1/auth/phantom-verify
app.post('/api/v1/auth/phantom-verify', async (req, res) => {
  try {
    const { publicKeyBase58, signedMessageBase64, email } = req.body as {
      publicKeyBase58?: string;
      signedMessageBase64?: string;
      email?: string;
    };

    if (!publicKeyBase58 || !signedMessageBase64) {
      return res.status(400).json({ error: 'Missing public key or signed message' });
    }

    // Verify signature using NaCl + Solana PublicKey (base58 decode)
    try {
      const pubkeyBytes = new PublicKey(publicKeyBase58).toBytes();
      const signatureBytes = new Uint8Array(Buffer.from(signedMessageBase64, 'base64'));
      const messageBytes = Buffer.from('Authorize access to HFSP Agent Provisioning');
      
      const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
      if (!verified) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (err) {
      console.error('Signature verification error:', err);
      return res.status(400).json({ error: 'Invalid public key format' });
    }

    // Check if wallet already has an account
    let user = db.prepare(`
      SELECT user_id, subscription_tier, trial_expires_at
      FROM users
      WHERE phantom_wallet_address = ?
    `).get(publicKeyBase58) as any;

    if (!user) {
      // New Phantom account - check email combo for trial eligibility
      if (email) {
        const existingEmail = db.prepare(`
          SELECT telegram_user_id FROM users WHERE email = ?
        `).get(email);

        if (existingEmail) {
          return res.status(409).json({
            error: 'Email already linked to another wallet. Please use email login or contact support.',
          });
        }
      }

      // Create new account with Phantom wallet
      const userId = `u_phantom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const trialStartedAt = new Date();
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);

      const syntheticTgIdPhantom = -(Date.now());
      db.prepare(`
        INSERT INTO users (telegram_user_id, user_id, phantom_wallet_address, email, subscription_tier, trial_started_at, trial_expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(syntheticTgIdPhantom, userId, publicKeyBase58, email || null, 'free_trial', trialStartedAt.toISOString(), trialExpiresAt.toISOString(), new Date().toISOString());

      user = {
        user_id: userId,
        subscription_tier: 'free_trial',
        trial_expires_at: trialExpiresAt.toISOString(),
      };
    }

    const token = signToken({
      sub: user.user_id,
      wallet: publicKeyBase58,
      email: email || null,
      auth_method: 'phantom',
      subscription_tier: user.subscription_tier,
    }, 86400);

    res.json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        wallet: publicKeyBase58,
        subscription: user.subscription_tier,
      },
    });
  } catch (error) {
    console.error('Phantom verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── SOLANA PAYMENT ENDPOINTS ────────────────────────────────────────────────

// POST /api/v1/auth/solana-pay-qr
app.post('/api/v1/auth/solana-pay-qr', async (req, res) => {
  try {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or missing token' });
    }

    const userId = payload.sub as string;
    
    // For now, hardcoded $9 USDC for Pro tier (1 month)
    const amountUsdc = 9;
    
    // Create payment record
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO crypto_payments (payment_id, user_id, amount_usdc, status)
      VALUES (?, ?, ?, ?)
    `).run(paymentId, userId, amountUsdc, 'pending');

    // Generate Solana Pay link (format: solana:WALLET?amount=AMOUNT&spl-token=USDC_TOKEN&reference=PAYMENT_ID)
    const USDC_MINT = 'EPjFWaJy47gHeQZzauRN123i8DAShsFXCqnnV6471zo'; // USDC on mainnet
    const solanaPayLink = `solana:${SOLANA_WALLET_ADDRESS}?amount=${amountUsdc}&spl-token=${USDC_MINT}&reference=${paymentId}`;

    // Generate QR code
    const qrCode = await QRCode.toDataURL(solanaPayLink);

    res.json({
      success: true,
      paymentId,
      amount: amountUsdc,
      currency: 'USDC',
      qrCode, // Data URL for embedding in UI
      solanaPayLink,
    });
  } catch (error) {
    console.error('Solana Pay QR error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// POST /api/v1/auth/verify-payment
app.post('/api/v1/auth/verify-payment', async (req, res) => {
  try {
    const { paymentId, transactionSignature } = req.body as {
      paymentId?: string;
      transactionSignature?: string;
    };

    if (!paymentId || !transactionSignature) {
      return res.status(400).json({ error: 'Missing payment ID or transaction signature' });
    }

    const payment = db.prepare('SELECT * FROM crypto_payments WHERE payment_id = ?').get(paymentId) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // In MVP: trust the client-provided signature (TODO: verify on chain)
    // In production: query Solana RPC to verify the transaction
    const connection = new Connection(SOLANA_RPC_URL);
    try {
      const tx = await connection.getTransaction(transactionSignature, { commitment: 'confirmed' });
      if (!tx) {
        return res.status(400).json({ error: 'Transaction not found on chain' });
      }
    } catch (err) {
      console.error('Failed to verify transaction on chain:', err);
      // For MVP, continue anyway
    }

    // Update payment status
    db.prepare(`
      UPDATE crypto_payments
      SET status = ?, transaction_signature = ?, confirmed_at = ?
      WHERE payment_id = ?
    `).run('confirmed', transactionSignature, new Date().toISOString(), paymentId);

    // Upgrade user subscription
    db.prepare(`
      UPDATE users
      SET subscription_tier = ?
      WHERE user_id = ?
    `).run('pro', payment.user_id);

    res.json({
      success: true,
      message: 'Payment confirmed. Subscription upgraded to Pro!',
      subscriptionTier: 'pro',
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});


// ── JWT AUTH MIDDLEWARE ──────────────────────────────────────────────────────

function requireAuth(req: any, res: any): Record<string, unknown> | null {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or missing token' });
    return null;
  }
  return payload;
}

// ── AGENT PROVISIONING API ──────────────────────────────────────────────────

// Reusable port allocation (extracted from Telegram bot flow)
function allocateFreeDashboardPort(): number {
  const used = new Set<number>(
    (db.prepare("SELECT dashboard_port FROM tenants WHERE dashboard_port IS NOT NULL AND (status IS NULL OR status != 'deleted')").all() as any[])
      .map((r: any) => Number(r.dashboard_port))
      .filter((n: number) => Number.isFinite(n))
  );
  for (let i = 0; i < 2000; i++) {
    const p = 19000 + Math.floor(Math.random() * 1000);
    if (!used.has(p)) return p;
  }
  for (let p = 19000; p < 20000; p++) if (!used.has(p)) return p;
  throw new Error('No free dashboard ports available (19000-19999).');
}

// POST /api/v1/agents - Create and provision a new agent
app.post('/api/v1/agents', async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    const userId = payload.sub as string;
    const { name, provider, model, botToken, openaiApiKey, anthropicApiKey, openrouterApiKey, kimiApiKey } = req.body as {
      name?: string;
      provider?: string;
      model?: string;
      botToken?: string;
      openaiApiKey?: string;
      anthropicApiKey?: string;
      openrouterApiKey?: string;
      kimiApiKey?: string;
    };

    if (!name || !provider || !model || !botToken) {
      return res.status(400).json({ error: 'Missing required fields: name, provider, model, botToken' });
    }

    // Lookup user by user_id (email/phantom users) or telegram_user_id (Telegram users)
    const user = db.prepare(`
      SELECT telegram_user_id, user_id, subscription_tier, trial_expires_at
      FROM users WHERE user_id = ? OR CAST(telegram_user_id AS TEXT) = ?
    `).get(userId, userId) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tgUserId = user.telegram_user_id;
    const tier = user?.subscription_tier || 'free_trial';

    // Check trial expiration
    if (tier === 'free_trial' && user?.trial_expires_at) {
      if (new Date(user.trial_expires_at) < new Date()) {
        return res.status(403).json({ error: 'Trial expired. Upgrade to Pro to create agents.' });
      }
    }

    // Count existing agents using actual telegram_user_id
    const agentCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM tenants WHERE telegram_user_id = ? AND status != 'deleted' AND deleted_at IS NULL"
    ).get(tgUserId) as any)?.cnt || 0;

    // Trial users: max 1 agent
    if (tier === 'free_trial' && agentCount >= 1) {
      return res.status(403).json({ error: 'Trial plan limited to 1 agent. Upgrade to Pro for unlimited agents.' });
    }

    // Allocate port and create tenant
    const tenantId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const dashboardPort = allocateFreeDashboardPort();
    const botTokenFp = tokenFingerprint(botToken);

    // Insert tenant record
    db.prepare(
      `INSERT INTO tenants(tenant_id, telegram_user_id, agent_name, bot_username, template_id, provider, model_preset, dashboard_port, gateway_token, telegram_token_fp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      tenantId,
      tgUserId,
      name,
      null,
      'blank',
      provider,
      model,
      dashboardPort,
      null,
      botTokenFp,
      'provisioning'
    );

    // Respond immediately - provisioning happens async
    res.status(202).json({
      success: true,
      agent: {
        id: tenantId,
        name,
        status: 'provisioning',
        dashboardPort,
        provider,
        model,
        createdAt: new Date().toISOString(),
      },
      message: 'Agent provisioning started. Check status with GET /api/v1/agents/' + tenantId,
    });

    // ── ASYNC PROVISIONING ──────────────────────────────────────────────
    (async () => {
      try {
        const tenantDir = `${TENANT_VPS_BASEDIR}/${tenantId}`;
        const workspaceDir = `${tenantDir}/workspace`;
        const secretsDir = `${tenantDir}/secrets`;

        // Create directories on VPS
        sshTenant(`mkdir -p ${workspaceDir} ${secretsDir}`);

        // Write Telegram token
        const telegramTokenB64 = Buffer.from(botToken.trim() + '\n').toString('base64');
        sshTenant(`bash -lc 'echo ${shSingleQuote(telegramTokenB64)} | base64 -d > ${secretsDir}/telegram.token'`);

        // Write API keys
        if (provider === 'openai' && openaiApiKey) {
          const k = Buffer.from(openaiApiKey.trim() + '\n').toString('base64');
          sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/openai.key'`);
        }
        if (provider === 'anthropic' && anthropicApiKey) {
          const k = Buffer.from(anthropicApiKey.trim() + '\n').toString('base64');
          sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/anthropic.key'`);
        }

        if (provider === 'openrouter' && openrouterApiKey) {
          const k = Buffer.from(openrouterApiKey.trim() + '\n').toString('base64');
          sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/openrouter.key'`);
        }
        if (provider === 'kimi' && kimiApiKey) {
          const k = Buffer.from(kimiApiKey.trim() + '\n').toString('base64');
          sshTenant(`bash -lc 'echo ${shSingleQuote(k)} | base64 -d > ${secretsDir}/moonshot.key'`);
        }

        // Generate gateway token
        const gatewayToken = Buffer.from(`${tenantId}:${Math.random().toString(36).slice(2)}`).toString('hex').slice(0, 48);
        db.prepare(`UPDATE tenants SET gateway_token = ? WHERE tenant_id = ?`).run(encryptString(gatewayToken), tenantId);

        // Build auth profile based on provider
        const authProfile: Record<string, any> = {};
        if (provider === 'anthropic') {
          authProfile[`anthropic:default`] = { provider: 'anthropic', mode: 'api_key' };
        } else if (provider === 'openai') {
          authProfile[`openai:default`] = { provider: 'openai', mode: 'api_key' };
        } else if (provider === 'openrouter') {
          authProfile[`openrouter:default`] = { provider: 'openrouter', mode: 'api_key' };
        } else if (provider === 'kimi') {
          authProfile[`moonshot:default`] = { provider: 'moonshot', mode: 'api_key' };
        }

        // Write openclaw.json
        const openclawConfig: Record<string, any> = {
          agents: {
            defaults: { workspace: '/tenant/workspace' },
            list: [{
              id: 'main',
              default: true,
              name: name ?? 'Agent',
              workspace: '/tenant/workspace',
              model: model ?? undefined,
              identity: { name: name ?? 'Agent', emoji: '🧭' }
            }]
          },
          ...(Object.keys(authProfile).length > 0 ? { auth: { profiles: authProfile } } : {}),
          gateway: {
            port: dashboardPort,
            bind: 'lan',
            mode: 'local',
            auth: { mode: 'token', token: gatewayToken },
            controlUi: {
              enabled: true,
              allowedOrigins: [`http://localhost:${dashboardPort}`, `http://127.0.0.1:${dashboardPort}`]
            }
          },
          plugins: { entries: { telegram: { enabled: true } } },
          channels: {
            telegram: {
              enabled: true,
              accounts: {
                default: {
                  enabled: true,
                  dmPolicy: 'pairing',
                  groupPolicy: 'disabled',
                  tokenFile: '/home/clawd/.openclaw/secrets/telegram.token',
                  streaming: 'off'
                }
              }
            }
          },
          bindings: [{ agentId: 'main', match: { channel: 'telegram', accountId: 'default' } }]
        };

        const configB64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString('base64');
        sshTenant(`bash -lc 'echo ${shSingleQuote(configB64)} | base64 -d > ${tenantDir}/openclaw.json'`);

        // Stop/remove existing container
        sshTenant(`docker rm -f hfsp_${tenantId} >/dev/null 2>&1 || true`);

        // Start container
        const runParts = [
          'docker run -d',
          `--name hfsp_${tenantId}`,
          '--restart unless-stopped',
          `-p 127.0.0.1:${dashboardPort}:${dashboardPort}`,
          `-v ${workspaceDir}:/tenant/workspace`,
          `-v ${tenantDir}/openclaw.json:/home/clawd/.openclaw/openclaw.json:ro`,
          `-v ${secretsDir}:/home/clawd/.openclaw/secrets:ro`,
        ];
        // Inject provider API keys — patched entrypoint reads from key files automatically
        // but we also pass via env for belt-and-suspenders
        if (provider === 'openrouter') {
          runParts.push(`-e OPENROUTER_API_KEY="$(cat ${secretsDir}/openrouter.key | tr -d '\n\r')"`);
        } else if (provider === 'openai') {
          runParts.push(`-e OPENAI_API_KEY="$(cat ${secretsDir}/openai.key | tr -d '\n\r')"`);
        } else if (provider === 'anthropic') {
          runParts.push(`-e ANTHROPIC_API_KEY="$(cat ${secretsDir}/anthropic.key | tr -d '\n\r')"`);
        } else if (provider === 'kimi') {
          runParts.push(`-e MOONSHOT_API_KEY="$(cat ${secretsDir}/moonshot.key | tr -d '\n\r')"`);
        }
        runParts.push(TENANT_RUNTIME_IMAGE);
        const runCmd = runParts.join(' ');

        sshTenant(runCmd);

        // Fix permissions
        sshTenant(
          `docker exec -u root hfsp_${tenantId} bash -lc ${shSingleQuote(
            'chown -R 10001:10001 /tenant/workspace || true; chmod -R u+rwX /tenant/workspace || true'
          )}`
        );
        // Mark as awaiting_pairing — user must enter bot pairing code to activate
        db.prepare(`UPDATE tenants SET status = 'awaiting_pairing' WHERE tenant_id = ?`).run(tenantId);
        console.log(`✅ Agent ${tenantId} docker started on port ${dashboardPort} — awaiting pairing`);

      } catch (err) {
        console.error(`❌ Provisioning failed for ${tenantId}:`, err);
        db.prepare(`UPDATE tenants SET status = 'failed' WHERE tenant_id = ?`).run(tenantId);
      }
    })();
  } catch (error) {
    console.error('Agent creation error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// GET /api/v1/agents - List user's agents
app.get('/api/v1/agents', (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const userId = payload.sub as string;

  const userRow = db.prepare(`SELECT telegram_user_id FROM users WHERE user_id = ? OR CAST(telegram_user_id AS TEXT) = ?`).get(userId, userId) as any;
  const resolvedTgId = userRow?.telegram_user_id ?? userId;

  const agents = db.prepare(`
    SELECT tenant_id, agent_name, provider, model_preset, dashboard_port, status, created_at
    FROM tenants
    WHERE telegram_user_id = ?
      AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(resolvedTgId) as any[];

  res.json({
    agents: agents.map((a: any) => ({
      id: a.tenant_id,
      name: a.agent_name,
      provider: a.provider,
      model: a.model_preset,
      dashboardPort: a.dashboard_port,
      status: a.status,
      createdAt: a.created_at,
    })),
  });
});

// GET /api/v1/agents/:id - Agent details
app.get('/api/v1/agents/:id', (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const userId = payload.sub as string;
  const agentId = req.params.id;

  const detailUserRow = db.prepare(`SELECT telegram_user_id FROM users WHERE user_id = ? OR CAST(telegram_user_id AS TEXT) = ?`).get(userId, userId) as any;
  const detailTgId = detailUserRow?.telegram_user_id ?? userId;

  const agent = db.prepare(`
    SELECT tenant_id, agent_name, provider, model_preset, dashboard_port, gateway_token, status, created_at
    FROM tenants
    WHERE tenant_id = ? AND telegram_user_id = ? AND deleted_at IS NULL
  `).get(agentId, detailTgId) as any;

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({
    agent: {
      id: agent.tenant_id,
      name: agent.agent_name,
      provider: agent.provider,
      model: agent.model_preset,
      dashboardPort: agent.dashboard_port,
      status: agent.status,
      createdAt: agent.created_at,
    },
  });
});


// POST /api/v1/agents/:id/pair - Approve pairing code for an agent
app.post('/api/v1/agents/:id/pair', async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const userId = payload.sub as string;
  const agentId = req.params.id;
  const { pairingCode } = req.body as { pairingCode?: string };

  if (!pairingCode || !/^[A-Z0-9]{6,12}$/i.test(pairingCode.trim())) {
    res.status(400).json({ error: 'Invalid pairing code format' });
    return;
  }

  const userRow = db.prepare(`SELECT telegram_user_id FROM users WHERE user_id = ? OR CAST(telegram_user_id AS TEXT) = ?`).get(userId, userId) as any;
  const resolvedTgId = userRow?.telegram_user_id ?? userId;

  const agent = db.prepare(`
    SELECT tenant_id, status FROM tenants
    WHERE tenant_id = ? AND telegram_user_id = ? AND deleted_at IS NULL
  `).get(agentId, resolvedTgId) as any;

  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  if (agent.status !== 'awaiting_pairing') {
    res.status(409).json({ error: `Agent is not awaiting pairing (current status: ${agent.status})` });
    return;
  }

  const containerName = `hfsp_${agentId}`;
  const code = pairingCode.trim().toUpperCase();

  try {
    const approveCmd = `docker exec -u clawd ${containerName} bash -lc ${shSingleQuote('HOME=/home/clawd openclaw pairing approve telegram ' + code)}`;
    const out = sshTenant(approveCmd);
    db.prepare(`UPDATE tenants SET status = 'active' WHERE tenant_id = ?`).run(agentId);
    console.log(`✅ Pairing approved for ${agentId}: ${out.trim()}`);
    res.json({ success: true, message: 'Agent paired and active' });
  } catch (err: any) {
    console.error('Pairing approve failed:', err);
    const stderr: string = err?.stderr ?? '';
    if (stderr.includes('No pending pairing request')) {
      res.status(400).json({ error: 'Code not found. Send /start to your bot again to get a fresh code, then submit it here.' });
    } else if (stderr.includes('expired') || stderr.includes('invalid')) {
      res.status(400).json({ error: 'Pairing code is invalid or expired. Send /start to your bot to get a new one.' });
    } else {
      res.status(500).json({ error: 'Pairing failed. Make sure your bot is running and try again.' });
    }
  }
});

// DELETE /api/v1/agents/:id - Delete (deprovision) an agent
app.delete('/api/v1/agents/:id', async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const userId = payload.sub as string;
  const agentId = req.params.id;

  const delUserRow = db.prepare(`SELECT telegram_user_id FROM users WHERE user_id = ? OR CAST(telegram_user_id AS TEXT) = ?`).get(userId, userId) as any;
  const delTgId = delUserRow?.telegram_user_id ?? userId;

  const agent = db.prepare(`
    SELECT tenant_id, status
    FROM tenants
    WHERE tenant_id = ? AND telegram_user_id = ? AND deleted_at IS NULL
  `).get(agentId, delTgId) as any;

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  try {
    const containerName = `hfsp_${agentId}`;
    const tenantDir = `${TENANT_VPS_BASEDIR}/${agentId}`;
    const trashDir = `${TENANT_VPS_BASEDIR}/.trash/${agentId}-${Date.now()}`;

    // Stop and remove container
    try {
      sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);
      sshTenant(`mkdir -p ${TENANT_VPS_BASEDIR}/.trash && (mv ${tenantDir} ${trashDir} 2>/dev/null || true)`);
    } catch (err) {
      console.error(`Deprovision SSH error for ${agentId}:`, err);
    }

    // Soft-delete in DB
    db.prepare(`UPDATE tenants SET status = 'deleted', deleted_at = datetime('now') WHERE tenant_id = ?`).run(agentId);

    res.json({ success: true, message: 'Agent deleted' });
  } catch (error) {
    console.error('Agent deletion error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/v1/agents/deploy - Deploy a new agent (called by Clawdrop MCP)
app.post('/api/v1/agents/deploy', async (req, res) => {
  try {
    const {
      deployment_id,
      tier_id,
      region,
      capability_bundle,
      payment_verified,
      wallet_address,
      telegram_token,
      llm_provider,
      llm_api_key,
      config,
    } = req.body as {
      deployment_id?: string;
      tier_id?: string;
      region?: string;
      capability_bundle?: string;
      payment_verified?: boolean;
      wallet_address?: string;
      telegram_token?: string;
      llm_provider?: 'anthropic' | 'openai' | 'openrouter';
      llm_api_key?: string;
      config?: Record<string, any>;
    };

    if (!tier_id || !wallet_address) {
      return res.status(400).json({ error: 'Missing required fields: tier_id, wallet_address' });
    }

    if (!payment_verified) {
      return res.status(400).json({ error: 'Payment not verified' });
    }

    // Generate tenant ID
    const tenantId = deployment_id || `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const dashboardPort = 30000 + Math.floor(Math.random() * 10000);
    const gatewayToken = crypto.randomBytes(32).toString('hex');

    // Determine provider from tier_id (simple mapping)
    let provider = 'anthropic'; // default
    if (tier_id.includes('openai')) provider = 'openai';
    if (tier_id.includes('kimi')) provider = 'kimi';

    // SSH to tenant VPS and set up directories
    const tenantDir = `${TENANT_VPS_BASEDIR}/${tenantId}`;
    const workspaceDir = `${tenantDir}/workspace`;
    const secretsDir = `${tenantDir}/secrets`;

    try {
      sshTenant(`mkdir -p ${workspaceDir} ${secretsDir}`);
    } catch (err) {
      console.error(`Failed to create tenant directories for ${tenantId}:`, err);
      return res.status(500).json({ error: 'Failed to provision tenant directories' });
    }

    // Create OpenClaw config
    const openclawConfig = {
      gateway: {
        bind: 'lan',
        mode: 'local',
        auth: { mode: 'token', token: gatewayToken },
        controlUi: {
          enabled: true,
          allowedOrigins: [`http://localhost:${dashboardPort}`, `http://127.0.0.1:${dashboardPort}`],
        },
      },
      plugins: { entries: { telegram: { enabled: true } } },
      channels: {
        telegram: {
          enabled: true,
          accounts: {
            default: {
              enabled: true,
              dmPolicy: 'pairing',
              groupPolicy: 'disabled',
              tokenFile: '/home/clawd/.openclaw/secrets/telegram.token',
              streaming: 'off',
            },
          },
        },
      },
      bindings: [{ agentId: 'main', match: { channel: 'telegram', accountId: 'default' } }],
    };

    const configB64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString('base64');
    sshTenant(`bash -lc 'echo ${configB64} | base64 -d > ${tenantDir}/openclaw.json'`);

    // Start tenant container
    const containerName = `hfsp_${tenantId}`;
    sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);

    const runParts = [
      'docker run -d',
      `--name ${containerName}`,
      '--restart unless-stopped',
      // Resource limits (kvm-4 tier: 1.5GB RAM, 0.5 CPU, 100 PIDs)
      '--memory=1.5g',
      '--memory-swap=1.5g',
      '--cpus=0.5',
      '--pids-limit=100',
      `-p 127.0.0.1:${dashboardPort}:${dashboardPort}`,
      `-v ${workspaceDir}:/tenant/workspace`,
      `-v ${tenantDir}/openclaw.json:/home/clawd/.openclaw/openclaw.json:ro`,
      `-v ${secretsDir}:/home/clawd/.openclaw/secrets:ro`,
      // Agent identification
      `-e AGENT_ID="${tenantId}"`,
      `-e OWNER_WALLET="${wallet_address || ''}"`,
      // Telegram bot token (if provided)
      `-e TELEGRAM_BOT_TOKEN="${telegram_token || ''}"`,
      // LLM provider and API key
      `-e LLM_PROVIDER="${llm_provider || 'anthropic'}"`,
      `-e ANTHROPIC_API_KEY="${llm_provider === 'anthropic' ? (llm_api_key || '') : ''}"`,
      `-e OPENAI_API_KEY="${llm_provider === 'openai' ? (llm_api_key || '') : ''}"`,
      `-e OPENROUTER_API_KEY="${llm_provider === 'openrouter' ? (llm_api_key || '') : ''}"`,
    ];

    runParts.push(TENANT_RUNTIME_IMAGE);
    const runCmd = runParts.join(' ');
    sshTenant(runCmd);

    // Fix permissions
    sshTenant(`docker exec -u root ${containerName} bash -lc 'chown -R 10001:10001 /tenant/workspace || true; chmod -R u+rwX /tenant/workspace || true'`);

    // Save tenant record
    db.prepare(`
      INSERT INTO tenants (tenant_id, telegram_user_id, agent_name, bot_username, template_id, provider, model_preset, dashboard_port, gateway_token, status)
      VALUES (?, 0, ?, ?, 'blank', ?, 'smart', ?, ?, 'active')
    `).run(tenantId, config?.agent_name || tier_id, tierIdToBotUsername(tier_id), provider, dashboardPort, gatewayToken);

    const endpoint = `http://127.0.0.1:${dashboardPort}`;

    res.json({
      agent_id: tenantId,
      endpoint,
      status: 'provisioning',
    });
  } catch (error) {
    console.error('Agent deployment error:', error);
    res.status(500).json({ error: 'Failed to deploy agent', details: error instanceof Error ? error.message : String(error) });
  }
});

// Helper to generate a bot username from tier_id
function tierIdToBotUsername(tierId: string): string {
  return `claw_${tierId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now().toString(36).slice(-4)}_bot`;
}

// GET /api/v1/agents/:id/status - Get agent status
app.get('/api/v1/agents/:id/status', async (req, res) => {
  try {
    const agentId = req.params.id;
    const containerName = `hfsp_${agentId}`;

    // Check container status via SSH
    let containerStatus = 'unknown';
    let logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error'; message: string }> = [];

    try {
      const dockerPs = sshTenant(`docker ps --filter name=${containerName} --format '{{.Status}}' 2>/dev/null || echo ''`);
      if (dockerPs.includes('Up')) {
        containerStatus = 'running';
      } else {
        containerStatus = 'stopped';
      }

      // Get recent logs
      const dockerLogs = sshTenant(`docker logs --tail 20 ${containerName} 2>&1 || echo ''`);
      logs = dockerLogs.split('\n').filter(Boolean).map((line, i) => ({
        timestamp: new Date(Date.now() - (20 - i) * 1000).toISOString(),
        level: line.includes('error') || line.includes('ERROR') ? 'error' : 'info',
        message: line,
      }));
    } catch (err) {
      console.error(`Failed to get container status for ${agentId}:`, err);
      containerStatus = 'error';
    }

    // Get tenant info from DB
    const tenant = db.prepare('SELECT status, dashboard_port, created_at FROM tenants WHERE tenant_id = ?').get(agentId) as any;

    const uptimeSeconds = tenant?.created_at
      ? Math.floor((Date.now() - new Date(tenant.created_at).getTime()) / 1000)
      : 0;

    res.json({
      agent_id: agentId,
      status: containerStatus === 'running' ? 'running' : containerStatus,
      uptime_seconds: uptimeSeconds,
      logs,
      health: {
        cpu_usage: 0, // Would need container stats
        memory_usage: 0,
        last_activity: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Agent status error:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// GET /api/v1/agents/:id/logs - Get agent logs
app.get('/api/v1/agents/:id/logs', async (req, res) => {
  try {
    const agentId = req.params.id;
    const containerName = `hfsp_${agentId}`;

    let logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error'; message: string }> = [];

    try {
      const dockerLogs = sshTenant(`docker logs --tail 100 ${containerName} 2>&1 || echo ''`);
      logs = dockerLogs.split('\n').filter(Boolean).map((line, i) => ({
        timestamp: new Date(Date.now() - (100 - i) * 1000).toISOString(),
        level: line.includes('error') || line.includes('ERROR') ? 'error' : line.includes('warn') || line.includes('WARN') ? 'warn' : 'info',
        message: line,
      }));
    } catch (err) {
      console.error(`Failed to get logs for ${agentId}:`, err);
    }

    res.json({ logs });
  } catch (error) {
    console.error('Agent logs error:', error);
    res.status(500).json({ error: 'Failed to get agent logs' });
  }
});

// GET /api/v1/user/profile - Get user profile
app.get('/api/v1/user/profile', (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const userId = payload.sub as string;

  const user = db.prepare(`
    SELECT user_id, email, phantom_wallet_address, subscription_tier, trial_started_at, trial_expires_at, created_at
    FROM users
    WHERE user_id = ?
  `).get(userId) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Resolve the actual telegram_user_id for tenants lookup
  const tgId = user?.telegram_user_id;
  const agentCount = tgId ? (db.prepare(
    "SELECT COUNT(*) as cnt FROM tenants WHERE telegram_user_id = ? AND status != 'deleted' AND deleted_at IS NULL"
  ).get(tgId) as any)?.cnt || 0 : 0;

  res.json({
    user: {
      userId: user.user_id,
      email: user.email,
      wallet: user.phantom_wallet_address,
      subscription: user.subscription_tier,
      trialStartedAt: user.trial_started_at,
      trialExpiresAt: user.trial_expires_at,
      createdAt: user.created_at,
      agentCount,
    },
  });
});

// Initialize provisioner for cleanup jobs
const provisionerConfig: ProvisionerConfig = {
  sshKey: TENANT_VPS_SSH_KEY,
  runtimeImage: TENANT_RUNTIME_IMAGE,
  basedir: TENANT_VPS_BASEDIR,
};

const provisioner = new ShellProvisioner(
  provisionerConfig,
  TENANT_VPS_HOST,
  TENANT_VPS_USER,
  'kvm-4' // Default tier, can be made configurable via env
);

// Schedule cleanup of inactive containers every 6 hours
// Removes containers inactive for >24 hours
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const INACTIVE_THRESHOLD_HOURS = 24;

async function runCleanup() {
  try {
    console.log(`[${new Date().toISOString()}] Running container cleanup...`);
    const result = await provisioner.cleanupInactiveContainers(INACTIVE_THRESHOLD_HOURS);
    if (result.cleaned.length > 0) {
      console.log(`[Cleanup] Removed ${result.cleaned.length} inactive containers:`, result.cleaned);
    }
    if (result.errors.length > 0) {
      console.error(`[Cleanup] Errors:`, result.errors);
    }
    console.log(`[${new Date().toISOString()}] Cleanup complete. Skipped: ${result.skipped.length}`);
  } catch (err) {
    console.error('[Cleanup] Failed:', err);
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Storefront bot webhook listening on http://0.0.0.0:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
  // Configure the Mini App menu button on startup
  setupMenuButton().catch((e) => console.error('setupMenuButton error:', e));
  console.log(`Tenant VPS: ${TENANT_VPS_USER}@${TENANT_VPS_HOST} (key=${TENANT_VPS_SSH_KEY}) baseDir=${TENANT_VPS_BASEDIR}`);
  console.log(`Tenant runtime image: ${TENANT_RUNTIME_IMAGE}`);
  
  // Start periodic cleanup
  console.log(`Starting container cleanup job (every ${CLEANUP_INTERVAL_MS / (60 * 60 * 1000)}h, threshold: ${INACTIVE_THRESHOLD_HOURS}h)`);
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  // Run initial cleanup on startup
  runCleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM MINI APP (WEBAPP) INTEGRATION
// Added: webapp auth endpoint + /app bot command + menu button setup
// ─────────────────────────────────────────────────────────────────────────────

const WEBAPP_URL = process.env.WEBAPP_URL ?? 'https://miniapp.hfsp.cloud';
// Derive a signing secret from the DB secret so we don't need a new env var
const WEBAPP_JWT_SECRET = crypto.createHmac('sha256', HFSP_DB_SECRET).update('webapp_jwt').digest();

// ── Simple HMAC-SHA256 signed token (no external dep) ───────────────────────
function signToken(payload: Record<string, unknown>, expiresInSec = 3600): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSec, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const sig     = crypto.createHmac('sha256', WEBAPP_JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', WEBAPP_JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Validate Telegram initData (HMAC-SHA256 per Telegram docs) ───────────────
function validateInitData(initData: string, botToken: string): Record<string, string> | null {
  try {
    const params = new URLSearchParams(initData);
    const hash   = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected  = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hash, 'hex'))) return null;

    // Check auth_date is within 24h
    const authDate = parseInt(params.get('auth_date') ?? '0', 10);
    if (Date.now() / 1000 - authDate > 86400) return null;

    return Object.fromEntries(params.entries());
  } catch {
    return null;
  }
}

// ── POST /api/webapp/auth ────────────────────────────────────────────────────
app.post('/api/webapp/auth', (req, res) => {
  const { initData } = req.body as { initData?: string };
  if (!initData) {
    res.status(400).json({ error: { code: 'MISSING_INIT_DATA', message: 'initData is required' } });
    return;
  }

  const parsed = validateInitData(initData, BOT_TOKEN);
  if (!parsed) {
    res.status(401).json({ error: { code: 'INVALID_INIT_DATA', message: 'initData validation failed' } });
    return;
  }

  let user: Record<string, unknown> = {};
  try { user = JSON.parse(parsed.user ?? '{}'); } catch { /* ignore */ }

  const telegramId = user.id as number;
  // Ensure user exists in users table so /api/v1/agents can find them
  getOrCreateUser(telegramId);
  const tenant = db.prepare('SELECT * FROM tenants WHERE telegram_user_id = ?').get(telegramId) as any;

  const token = signToken({
    sub:         String(telegramId),
    tenant_id:   tenant?.id ?? null,
    telegram_id: telegramId,
    first_name:  user.first_name,
    username:    user.username,
  });

  res.json({
    token,
    expires_in: 3600,
    user: {
      id:         tenant?.id ?? String(telegramId),
      telegram_id: telegramId,
      first_name:  user.first_name,
      last_name:   user.last_name,
      username:    user.username,
      language_code: user.language_code,
    },
  });
});

// ── GET /api/webapp/verify (middleware helper — verify JWT) ──────────────────
app.get('/api/webapp/verify', (req, res) => {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired' } });
    return;
  }
  res.json({ ok: true, payload });
});

// ── Configure Telegram Menu Button to open the Mini App ─────────────────────
async function setupMenuButton() {
  if (!WEBAPP_URL) return;
  try {
    const res = await fetch(`${TELEGRAM_API}/setChatMenuButton`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        menu_button: {
          type:    'web_app',
          text:    'Open App',
          web_app: { url: WEBAPP_URL },
        },
      }),
    });
    const body = await res.json() as any;
    if (body.ok) console.log('[webapp] Menu button configured →', WEBAPP_URL);
    else         console.warn('[webapp] Menu button setup failed:', body.description);
  } catch (err) {
    console.warn('[webapp] Menu button setup error:', err);
  }
}

// ── Handle /app command in the bot ─────────────────────────────────────────
// This is called from inside the webhook handler — export so it can be invoked.
async function handleAppCommand(chatId: number) {
  await sendMessage(chatId, '👇 Tap the button below to open your agent dashboard:', {
    reply_markup: {
      inline_keyboard: [[
        {
          text:    '🚀 Open Dashboard',
          web_app: { url: WEBAPP_URL },
        },
      ]],
    },
  });
}
