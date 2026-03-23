import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

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
const TENANT_VPS_USER = process.env.TENANT_VPS_USER ?? 'tenant';
const TENANT_VPS_SSH_KEY = process.env.TENANT_VPS_SSH_KEY ?? '/home/clawd/.ssh/id_ed25519_hfsp_provisioner';
const TENANT_VPS_BASEDIR = process.env.TENANT_VPS_BASEDIR ?? '/opt/hfsp/tenants';
const TENANT_RUNTIME_IMAGE = process.env.TENANT_RUNTIME_IMAGE ?? 'hfsp/openclaw-runtime:stable';
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
  provider?: 'openai' | 'anthropic' | 'other';
  openaiConnectMethod?: 'oauth_beta' | 'api_key';
  openaiApiKey?: string;
  anthropicApiKey?: string;
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

async function sendDocument(chatId: number, filePath: string, filename: string, caption?: string) {
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
          [{ text: 'OpenAI', callback_data: 'provider:openai' }],
          [{ text: 'Claude (Anthropic)', callback_data: 'provider:anthropic' }],
          [{ text: 'Others (coming soon)', callback_data: 'provider:others' }],
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

async function sendMenu(chatId: number) {
  const keyboard = {
    keyboard: [[{ text: 'Create agent' }], [{ text: 'My agents' }], [{ text: 'Help' }], [{ text: 'Status' }, { text: 'Cancel' }]],
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

      // Preset selection
      if (data?.startsWith('preset:') && w.step === 'await_model_preset') {
        const preset = data.split(':')[1];
        const modelPreset = preset === 'fast' ? 'fast' : preset === 'smart' ? 'smart' : undefined;
        if (!modelPreset) {
          await sendMessage(chatId, 'Invalid preset.');
          return;
        }
        setWizard(telegramUserId, 'idle', { ...w.data, modelPreset });
        await sendMessage(
          chatId,
          [
            `Saved: ${modelPreset === 'fast' ? 'Fast' : 'Smart'} preset.`,
            '',
            'Next: tap Status → Provision agent.'
          ].join('\n')
        );
        await sendMenu(chatId);
        return;
      }

      // Provision: create tenant + start container
      if (data === 'provision:start' || data === 'provision:retry') {
        try {
          await sendMessage(chatId, data === 'provision:retry' ? 'Retrying provisioning…' : 'Provisioning… (creating tenant + dashboard key)');

          const templateOk = Boolean(w.data.templateId);
          const providerOk = Boolean(w.data.provider);
          const presetOk = Boolean(w.data.modelPreset);
          const keyOk = Boolean(w.data.openaiApiKey || w.data.anthropicApiKey);

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

          // Write tenant openclaw.json
          // Reuse existing gateway token if present; otherwise generate.
          const row0 = db.prepare(`SELECT gateway_token FROM tenants WHERE tenant_id = ?`).get(tenantId) as any;
          const row = unprotectTenantRowTokens(row0);
          const gatewayToken = row?.gateway_token ? String(row.gateway_token) : Buffer.from(`${tenantId}:${Math.random().toString(36).slice(2)}`).toString('hex').slice(0, 48);
          // persist token for Advanced dashboard access instructions (encrypted)
          db.prepare(`UPDATE tenants SET gateway_token = ? WHERE tenant_id = ?`).run(encryptString(gatewayToken), tenantId);
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
                  identity: { name: w.data.agentName ?? 'Agent', emoji: '🧭' }
                }
              ]
            },
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

          const runCmd = [
            'docker run -d',
            `--name ${containerName}`,
            '--restart unless-stopped',
            `-p 127.0.0.1:${dashboardPort}:${dashboardPort}`,
            `-v ${workspaceDir}:/tenant/workspace`,
            `-v ${tenantDir}/openclaw.json:/home/clawd/.openclaw/openclaw.json:ro`,
            `-v ${secretsDir}:/home/clawd/.openclaw/secrets:ro`,
            TENANT_RUNTIME_IMAGE
          ].join(' ');

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
        const showArchived = data === 'agents:list_archived';
        const rows = db
          .prepare(
            `SELECT tenant_id, agent_name, bot_username, provider, model_preset, dashboard_port, gateway_token, status, created_at
             FROM tenants
             WHERE telegram_user_id = ?
               AND (status IS NULL OR status != 'deleted')
               AND (${showArchived ? "status = 'archived'" : "(status IS NULL OR status = 'active')"})
             ORDER BY created_at DESC
             LIMIT 10`
          )
          .all(telegramUserId) as Array<any>;

        if (!rows.length) {
          await sendMessage(chatId, 'No agents yet. Tap “Create agent” to make your first one.');
          await sendMenu(chatId);
          return;
        }

        await sendMessage(chatId, showArchived ? 'Pick an archived agent:' : 'Pick an agent:', {
          reply_markup: {
            inline_keyboard: rows
              .map((r) => {
                const name = r.agent_name ?? 'Agent';
                const bot = r.bot_username ? `@${r.bot_username}` : r.tenant_id;
                return [{ text: `${name} (${bot})`, callback_data: `agent:details:${r.tenant_id}` }];
              })
              .concat([
                showArchived
                  ? [{ text: 'Back to active', callback_data: 'agents:list' }]
                  : [{ text: 'Show archived', callback_data: 'agents:list_archived' }],
                [{ text: 'Back', callback_data: 'flow:back' }]
              ])
          }
        });
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
        const r = db
          .prepare(
            `SELECT tenant_id, agent_name, bot_username, provider, model_preset, dashboard_port, gateway_token, status, created_at
             FROM tenants
             WHERE telegram_user_id = ? AND tenant_id = ? AND (status IS NULL OR status != 'deleted')`
          )
          .get(telegramUserId, tenantId) as any;

        if (!r) {
          await sendMessage(chatId, 'Agent not found.');
          return;
        }

        const botLink = r.bot_username ? `https://t.me/${r.bot_username}` : undefined;
        const providerLabel = r.provider === 'openai' ? 'OpenAI' : r.provider === 'anthropic' ? 'Claude (Anthropic)' : r.provider ?? '—';

        const isArchived = r.status === 'archived';

        await sendMessage(
          chatId,
          [
            'Agent details:',
            `• Name: ${r.agent_name ?? '—'}`,
            `• Bot: ${r.bot_username ? '@' + r.bot_username : '—'}`,
            `• Provider: ${providerLabel}`,
            `• Preset: ${r.model_preset ?? '—'}`,
            `• Status: ${isArchived ? 'archived' : 'active'}`,
            `• Tenant: ${r.tenant_id}`,
            `• Created: ${r.created_at}`
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                botLink ? [{ text: 'Open bot', url: botLink }] : [{ text: 'Open bot', callback_data: 'noop' }],
                [{ text: 'Dashboard (Advanced)', callback_data: `agent:dashboard:${r.tenant_id}` }],
                [{ text: 'Health check', callback_data: `agent:health:${r.tenant_id}` }],
                isArchived
                  ? [{ text: 'Unarchive', callback_data: `agent:unarchive:${r.tenant_id}` }]
                  : [{ text: 'Archive', callback_data: `agent:archive:${r.tenant_id}` }],
                [{ text: 'Delete…', callback_data: `agent:delete_confirm:${r.tenant_id}` }],
                [{ text: 'Back to list', callback_data: isArchived ? 'agents:list_archived' : 'agents:list' }]
              ]
            }
          }
        );
        return;
      }

      if (data?.startsWith('agent:archive:')) {
        const tenantId = data.split(':').slice(2).join(':');
        db.prepare(`UPDATE tenants SET status='archived', archived_at=datetime('now') WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
        await sendMessage(chatId, 'Archived.');
        // return to details view
        await sendMessage(chatId, 'Updated.', { reply_markup: { inline_keyboard: [[{ text: 'Back to list', callback_data: 'agents:list' }]] } });
        return;
      }

      if (data?.startsWith('agent:unarchive:')) {
        const tenantId = data.split(':').slice(2).join(':');
        db.prepare(`UPDATE tenants SET status='active', archived_at=NULL WHERE telegram_user_id=? AND tenant_id=?`).run(telegramUserId, tenantId);
        await sendMessage(chatId, 'Unarchived.');
        await sendMessage(chatId, 'Updated.', { reply_markup: { inline_keyboard: [[{ text: 'Back to list', callback_data: 'agents:list' }]] } });
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
          await sendMessage(chatId, 'Back to your agents:', { reply_markup: { inline_keyboard: [[{ text: 'My agents', callback_data: 'agents:list' }]] } });
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
            `Tunnel (Mac/Linux):`,
            `ssh -i hfsp_${tenantId}.key -N -L ${r.dashboard_port}:127.0.0.1:${r.dashboard_port} dash@${TENANT_VPS_HOST}`,
            '',
            `Open: http://127.0.0.1:${r.dashboard_port}`,
            '',
            `Token (if prompted):`,
            r.gateway_token
          ].join('\n')
        );
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
            'This is optional. If you’re not comfortable with terminal commands, skip this.',
            '',
            `1) Start the tunnel (Mac/Linux):`,
            `ssh -i hfsp_${tenantId}.key -N -L ${port}:127.0.0.1:${port} dash@${TENANT_VPS_HOST}`,
            '',
            `2) Open: http://127.0.0.1:${port}`,
            '',
            `3) Dashboard token (if prompted):`,
            token
          ].join('\n')
        );
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
      const rows = db
        .prepare(
          `SELECT tenant_id, agent_name, bot_username, provider, model_preset, dashboard_port, status, created_at
           FROM tenants
           WHERE telegram_user_id = ? AND (status IS NULL OR status != 'deleted')
           ORDER BY created_at DESC
           LIMIT 10`
        )
        .all(telegramUserId) as Array<any>;

      if (!rows.length) {
        await sendMessage(chatId, 'No agents yet. Tap “Create agent” to make your first one.');
        await sendMenu(chatId);
        return;
      }

      const lines: string[] = ['Your agents (latest first):', ''];
      for (const r of rows) {
        const name = r.agent_name ?? 'Agent';
        const bot = r.bot_username ? `@${r.bot_username}` : '(bot unknown)';
        const prov = r.provider === 'anthropic' ? 'Claude' : r.provider === 'openai' ? 'OpenAI' : r.provider ?? '—';
        const st = r.status === 'archived' ? 'archived' : 'active';
        lines.push(`• ${name} — ${bot} — ${prov} — ${st} — ${r.tenant_id}`);
      }

      await sendMessage(chatId, lines.join('\n'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Show details…', callback_data: `agents:pick` }],
            [{ text: 'Show archived', callback_data: 'agents:list_archived' }],
            [{ text: 'Create agent', callback_data: 'flow:start_setup' }]
          ]
        }
      });
      return;
    }

    if (cmd === 'status') {
      const hasKey = Boolean(w.data.openaiApiKey || w.data.anthropicApiKey);
      const providerLabel = w.data.provider === 'openai' ? 'OpenAI' : w.data.provider === 'anthropic' ? 'Claude (Anthropic)' : w.data.provider === 'other' ? 'Other' : '—';
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Storefront bot webhook listening on http://127.0.0.1:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
  console.log(`Tenant VPS: ${TENANT_VPS_USER}@${TENANT_VPS_HOST} (key=${TENANT_VPS_SSH_KEY}) baseDir=${TENANT_VPS_BASEDIR}`);
  console.log(`Tenant runtime image: ${TENANT_RUNTIME_IMAGE}`);
});
