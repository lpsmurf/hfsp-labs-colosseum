import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN_FILE = process.env.TELEGRAM_BOT_TOKEN_FILE ?? '/home/clawd/.openclaw/secrets/hfsp_agent_bot.token';
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'storefront.sqlite');

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
`);

const BOT_TOKEN = readToken();
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

type WizardStep =
  | 'idle'
  | 'setup_intro'
  | 'await_agent_name'
  | 'botfather_helper'
  | 'await_bot_token'
  | 'await_template'
  | 'choose_provider'
  | 'connect_openai'
  | 'await_openai_api_key'
  | 'await_anthropic_api_key'
  | 'await_model_preset';

type WizardData = {
  agentName?: string;
  botToken?: string;
  templateId?: 'blank' | 'ops_starter';
  provider?: 'openai' | 'anthropic' | 'other';
  openaiConnectMethod?: 'oauth_beta' | 'api_key';
  openaiApiKey?: string;
  anthropicApiKey?: string;
  modelPreset?: 'fast' | 'smart';
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
            'Next step (coming next commit): provision your agent container + pairing.'
          ].join('\n')
        );
        await sendMenu(chatId);
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
      await sendMessage(chatId, `Setup status: ${w.step}`);
      return;
    }

    if (cmd === 'create' && w.step === 'idle') {
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
      transition(telegramUserId, w.step, 'await_template', { ...w.data, botToken: token });
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

    // Default
    await sendMenu(chatId);
  } catch (err) {
    console.error('Webhook handler error', err);
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Storefront bot webhook listening on http://127.0.0.1:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});
