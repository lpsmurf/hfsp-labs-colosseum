import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { poly } from './poly-agent.js';
import { checkAndIncrement, getQuota } from './rate-limit.js';
import { isBudgetExhausted, getBudgetRemaining, recordSpend, estimateCost } from './budget-guard.js';

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  PORT: z.string().default('8787'),
});

const env = EnvSchema.safeParse(process.env);
if (!env.success) {
  console.error('Missing ENV vars:', env.error.format());
  process.exit(1);
}

const PORT = parseInt(env.data.PORT, 10);
const app = express();
app.use(express.json());

const ORIGINS = ['https://clawdrop.live', 'http://localhost:3000', 'http://localhost:5173'];
app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  if (ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', budget_remaining: getBudgetRemaining() });
});

app.get('/api/quota', (req, res) => {
  const ip = ((req.headers['x-real-ip'] as string) ?? req.ip ?? '0.0.0.0');
  res.json(getQuota(ip));
});

app.post('/api/chat', async (req, res) => {
  console.log('[chat] start');
  
  const ChatSchema = z.object({
    message: z.string().min(1).max(1000),
    sessionId: z.string().min(1).max(64),
  });

  const parse = ChatSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const ip = (req.headers['x-real-ip'] as string) ?? req.ip ?? '0.0.0.0';

  if (isBudgetExhausted()) {
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    return res.status(429).json({ error: 'Daily budget exhausted' });
  }

  const quota = checkAndIncrement(ip);
  if (!quota.allowed) {
    return res.status(429).json({ error: 'Daily message limit reached' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(': waiting for response\n\n');

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    console.log('[chat] calling poly.stream');
    const stream = await poly.stream(parse.data.message);
    console.log('[chat] got stream');

    let text = '';
    let count = 0;
    for await (const chunk of stream.textStream) {
      count++;
      if (count === 1 || count % 10 === 0) console.log(`[chunk] #${count}`);
      if (closed) break;
      text += chunk;
      send('delta', { text: chunk });
    }

    console.log('[chat] done,chunks:', count);

    if (!text) {
      send('error', { message: 'No response' });
      res.end();
      return;
    }

    const usage = await stream.usage;
    if (usage) recordSpend(estimateCost(usage.promptTokens ?? 0, usage.completionTokens ?? 0));

    send('done', { remaining: quota.remaining });
    res.end();
  } catch (err) {
    console.error('[err]', err instanceof Error ? err.message : err);
    if (!res.writableEnded) {
      send('error', { message: 'Agent error' });
      res.end();
    }
  }
});

app.listen(PORT, () => console.log(`listening on :${PORT}`));
