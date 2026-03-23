import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN_FILE = process.env.TELEGRAM_BOT_TOKEN_FILE ?? '/home/clawd/.openclaw/secrets/hfsp_agent_bot.token';
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'storefront.sqlite');

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
    template_id TEXT,
    provider TEXT,
    model_preset TEXT,
    dashboard_port INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  | 'await_model_preset'
  | 'await_pairing_code';

type WizardData = {
  agentName?: string;
  botToken?: string;
  botUsername?: string; // without @
  templateId?: 'blank' | 'ops_starter';
  provider?: 'openai' | 'anthropic' | 'other';
  openaiConnectMethod?: 'oauth_beta' | 'api_key';
  openaiApiKey?: string;
  anthropicApiKey?: string;
  modelPreset?: 'fast' | 'smart';
  lastTenantId?: string;
  lastDashboardPort?: number;
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
    return { step: row.step, data: JSON.parse(row.data_json) as WizardData };
  } catch {
    return { step: row.step, data: {} };
  }
}

function setWizard(telegramUserId: number, step: WizardStep, data: WizardData) {
  db.prepare(
    `INSERT INTO wizard_state(telegram_user_id, step, data_json)
     VALUES (?, ?, ?)
     ON CONFLICT(telegram_user_id) DO UPDATE SET step=excluded.step, data_json=excluded.data_json, updated_at=datetime('now')`
  ).run(telegramUserId, step, JSON.stringify(data));
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
    keyboard: [[{ text: 'Create agent' }], [{ text: 'Status' }, { text: 'Cancel' }]],
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

      // Provision (v0): generate tenant id + dashboard tunnel key + instructions
      if (data === 'provision:start') {
        try {
          await sendMessage(chatId, 'Provisioning… (creating tenant + dashboard key)');

          const templateOk = Boolean(w.data.templateId);
          const providerOk = Boolean(w.data.provider);
          const presetOk = Boolean(w.data.modelPreset);
          const keyOk = Boolean(w.data.openaiApiKey || w.data.anthropicApiKey);

          if (!templateOk || !providerOk || !presetOk || !keyOk) {
            await sendMessage(chatId, 'You’re missing some setup steps. Tap Status and finish the missing items.');
            return;
          }

          const tenantId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const dashboardPort = 19000 + Math.floor(Math.random() * 1000);

          db.prepare(
            `INSERT INTO tenants(tenant_id, telegram_user_id, agent_name, template_id, provider, model_preset, dashboard_port)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            tenantId,
            telegramUserId,
            w.data.agentName ?? null,
            w.data.templateId ?? null,
            w.data.provider ?? null,
            w.data.modelPreset ?? null,
            dashboardPort
          );

          // Generate a one-time SSH key for dashboard tunnel
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfsp-dash-'));
          const keyBase = path.join(tmpDir, `hfsp_${tenantId}`);
          execFileSync('ssh-keygen', ['-t', 'ed25519', '-C', tenantId, '-f', keyBase, '-N', ''], { stdio: 'ignore' });
          const pub = fs.readFileSync(`${keyBase}.pub`, 'utf8').trim();

          await sendMessage(chatId, `Tenant created: ${tenantId}`);

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
          const gatewayToken = Buffer.from(`${tenantId}:${Math.random().toString(36).slice(2)}`).toString('hex').slice(0, 48);
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
                dmPolicy: 'pairing',
                groupPolicy: 'disabled',
                accounts: {
                  tenant: {
                    enabled: true,
                    dmPolicy: 'pairing',
                    tokenFile: '/home/clawd/.openclaw/secrets/telegram.token',
                    streaming: 'off'
                  }
                }
              }
            },
            bindings: [
              { agentId: 'main', match: { channel: 'telegram', accountId: 'tenant' } }
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

          // Send private key as a document (generate-once UX)
          // Save last tenant info for pairing step
          setWizard(telegramUserId, 'await_pairing_code', { ...w.data, lastTenantId: tenantId, lastDashboardPort: dashboardPort });

          // Send dashboard key (advanced)
          await sendDocument(chatId, keyBase, `hfsp_${tenantId}.key`, 'Dashboard SSH key (advanced, download once). Keep it private.');

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
                  [{ text: 'Cancel', callback_data: 'flow:cancel' }]
                ]
              }
            }
          );

          await sendMessage(
            chatId,
            [
              'Dashboard (Advanced):',
              `• Tunnel: ssh -i hfsp_${tenantId}.key -N -L ${dashboardPort}:127.0.0.1:${dashboardPort} dash@${TENANT_VPS_HOST}`,
              `• Open: http://127.0.0.1:${dashboardPort}`
            ].join('\n')
          );

          return;
        } catch (err) {
          console.error('Provision error', err);
          await sendMessage(chatId, `Provisioning failed: ${(err as Error)?.message ?? String(err)}`);
          return;
        }
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

    if (cmd === 'status') {
      const hasKey = Boolean(w.data.openaiApiKey || w.data.anthropicApiKey);
      const providerLabel = w.data.provider === 'openai' ? 'OpenAI' : w.data.provider === 'anthropic' ? 'Claude (Anthropic)' : w.data.provider === 'other' ? 'Other' : '—';
      const templateLabel = w.data.templateId === 'blank' ? 'Blank' : w.data.templateId === 'ops_starter' ? 'Ops Starter' : '—';
      const presetLabel = w.data.modelPreset ? (w.data.modelPreset === 'fast' ? 'Fast' : 'Smart') : '—';

      await sendMessage(
        chatId,
        [
          'Your setup so far:',
          `• Agent name: ${w.data.agentName ?? '—'}`,
          `• Template: ${templateLabel}`,
          `• Provider: ${providerLabel}`,
          `• Key: ${hasKey ? 'saved ✅' : 'missing'}`,
          `• Preset: ${presetLabel}`,
          `• Current step: ${w.step}`,
          '',
          'Next: Provision agent (this will create your isolated runtime + connect your bot).'
        ].join('\n'),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Provision agent', callback_data: 'provision:start' }],
              [{ text: 'Back', callback_data: 'flow:back' }, { text: 'Cancel', callback_data: 'flow:cancel' }]
            ]
          }
        }
      );
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
      transition(telegramUserId, w.step, 'await_bot_username', { ...w.data, botToken: token });
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
