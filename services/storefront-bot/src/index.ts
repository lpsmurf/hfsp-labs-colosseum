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

type WizardStep = 'idle' | 'await_agent_name' | 'await_bot_token' | 'await_template';

type WizardData = {
  agentName?: string;
  botToken?: string;
  templateId?: 'blank' | 'ops_starter';
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

function clearWizard(telegramUserId: number) {
  db.prepare('DELETE FROM wizard_state WHERE telegram_user_id = ?').run(telegramUserId);
}

async function sendMessage(chatId: number, text: string) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('sendMessage failed', res.status, body);
  }
}

async function sendMenu(chatId: number) {
  await sendMessage(
    chatId,
    [
      'HFSP Agent Provisioning (beta)',
      '',
      'Reply with:',
      '1) create  — create a new agent',
      '2) status  — show where you are in setup',
      '3) cancel  — cancel the current setup'
    ].join('\n')
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
  const chatId: number | undefined = msg?.chat?.id;
  const telegramUserId: number | undefined = msg?.from?.id;
  const text: string | undefined = msg?.text;

  if (!chatId || !telegramUserId) return;

  getOrCreateUser(telegramUserId);

  try {
    if (!text) {
      await sendMenu(chatId);
      return;
    }

    const norm = text.trim().toLowerCase();
    if (norm.startsWith('/start')) {
      await sendMenu(chatId);
      return;
    }

    if (norm === 'cancel') {
      clearWizard(telegramUserId);
      await sendMessage(chatId, 'Cancelled. Type "create" to start again.');
      return;
    }

    if (norm === 'status') {
      const w = getWizard(telegramUserId);
      await sendMessage(chatId, `Setup status: ${w.step}`);
      return;
    }

    const w = getWizard(telegramUserId);

    if (norm === 'create' && w.step === 'idle') {
      setWizard(telegramUserId, 'await_agent_name', {});
      await sendMessage(chatId, 'Name your agent (e.g., "My Ops Assistant"):');
      return;
    }

    if (w.step === 'await_agent_name') {
      const agentName = text.trim().slice(0, 60);
      setWizard(telegramUserId, 'await_bot_token', { ...w.data, agentName });
      await sendMessage(chatId, 'Paste your BotFather token (looks like 123456:ABC...).');
      return;
    }

    if (w.step === 'await_bot_token') {
      const token = text.trim();
      if (!token.includes(':') || token.length < 20) {
        await sendMessage(chatId, 'That token does not look valid. Paste the full BotFather token.');
        return;
      }
      setWizard(telegramUserId, 'await_template', { ...w.data, botToken: token });
      await sendMessage(
        chatId,
        [
          'Choose a template (reply with 1 or 2):',
          '1) Blank — minimal general assistant',
          '2) Ops Starter — tasks/notes/ops defaults (general-purpose)'
        ].join('\n')
      );
      return;
    }

    if (w.step === 'await_template') {
      const choice = norm;
      const templateId = choice === '2' ? 'ops_starter' : choice === '1' ? 'blank' : undefined;
      if (!templateId) {
        await sendMessage(chatId, 'Reply with 1 or 2.');
        return;
      }
      setWizard(telegramUserId, 'idle', { ...w.data, templateId });
      await sendMessage(
        chatId,
        [
          'Saved. Next step (coming next commit):',
          '- connect OpenAI (OAuth beta or API key)',
          '- provision container',
          '- pairing'
        ].join('\n')
      );
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
