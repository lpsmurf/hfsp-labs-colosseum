import express from 'express';
import fs from 'node:fs';

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN_FILE = process.env.TELEGRAM_BOT_TOKEN_FILE ?? '/home/clawd/.openclaw/secrets/hfsp_agent_bot.token';

function readToken(): string {
  const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!t || !t.includes(':')) throw new Error(`Invalid telegram token file: ${TOKEN_FILE}`);
  return t;
}

const BOT_TOKEN = readToken();
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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
  const chatId = msg?.chat?.id;
  const text: string | undefined = msg?.text;

  if (!chatId) return;

  try {
    if (!text) {
      await sendMessage(chatId, 'Send /start to begin.');
      return;
    }

    if (text.startsWith('/start')) {
      await sendMessage(
        chatId,
        [
          'HFSP Agent Provisioning (beta) is live.',
          '',
          'Next: we’ll add the onboarding wizard (create agent → token → template → connect OpenAI → provision → pairing).'
        ].join('\n')
      );
      return;
    }

    await sendMessage(chatId, 'Got it. For now try /start.');
  } catch (err) {
    console.error('Webhook handler error', err);
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Storefront bot webhook listening on http://127.0.0.1:${PORT}`);
});
