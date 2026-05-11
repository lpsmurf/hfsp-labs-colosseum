import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { poly } from './poly-agent.js';
import { checkAndIncrement, getQuota, saveEmail } from './rate-limit.js';
import { isBudgetExhausted, getBudgetRemaining, recordSpend, estimateCost } from './budget-guard.js';
import { checkInput, sanitizeOutput } from './guardrails.js';

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  PORT: z.string().default('8787'),
  TRUST_PROXY: z.string().default('false'),
});

const env = EnvSchema.safeParse(process.env);
if (!env.success) {
  console.error('Missing ENV vars:', env.error.format());
  process.exit(1);
}

const PORT = parseInt(env.data.PORT, 10);
const app = express();
app.set('trust proxy', ['1', 'true'].includes(env.data.TRUST_PROXY.toLowerCase()));
app.use(express.json());

function clientIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

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
  res.json(getQuota(clientIp(req)));
});

app.post('/api/lead', (req, res) => {
  const schema = z.object({ email: z.string().email().max(254) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid email' });
  saveEmail(clientIp(req), parse.data.email);
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  console.log('[chat] start');
  
  const ChatSchema = z.object({
    message: z.string().min(1).max(1000),
    sessionId: z.string().min(1).max(64).optional(),
    email: z.string().email().max(254).optional(),
  });

  const parse = ChatSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const ip = clientIp(req);

  if (isBudgetExhausted()) {
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    return res.status(429).json({ error: 'Daily budget exhausted' });
  }

  const quota = checkAndIncrement(ip);
  if (!quota.allowed) {
    return res.status(429).json({ error: 'Daily message limit reached' });
  }

  if (parse.data.email) {
    saveEmail(ip, parse.data.email);
  }

  // Input guardrail — prompt injection
  const inputCheck = checkInput(parse.data.message);
  if (!inputCheck.ok) {
    return res.status(400).json({ error: inputCheck.error });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Disable Nagle's algorithm so small SSE chunks are sent immediately
  const sock = (res as unknown as { socket?: { setNoDelay?(v: boolean): void } }).socket;
  sock?.setNoDelay?.(true);

  const flush = () => {
    try { (res as unknown as { flush?(): void }).flush?.(); } catch { /* noop */ }
  };

  const writeSSE = (line: string) => {
    if (!res.writableEnded) { res.write(line); flush(); }
  };

  writeSSE(': connected\n\n');

  const send = (event: string, data: unknown) => {
    try {
      writeSSE(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.log('[send-err]', e instanceof Error ? e.message : e);
    }
  };

  let closed = false;
  // Use res.on('close') — req.on('close') fires on body consumption in Node 20 (autoDestroy)
  res.on('close', () => { closed = true; console.log('[client] disconnected'); });

  const keepalive = setInterval(() => {
    try {
      if (!closed && !res.writableEnded) writeSSE(': keep-alive\n\n');
    } catch (e) { /* ignore */ }
  }, 15000);

  try {
    const streamStart = Date.now();
    console.log('[chat] calling poly.stream');
    const stream = await poly.stream(parse.data.message);
    console.log('[chat] got stream after', Date.now()-streamStart, 'ms');

    let text = '';
    let count = 0;
    const iterator = stream.textStream[Symbol.asyncIterator]();
    let result = await iterator.next();
    
    while (!result.done) {
      if (closed) break;
      const chunk = result.value;
      count++;
      if (count === 1 || count % 10 === 0) console.log(`[chunk] #${count}`);
      text += chunk;
      send('delta', { text: chunk });
      result = await iterator.next();
    }

    console.log('[chat] done, chunks:', count);
    clearInterval(keepalive);

    if (closed || res.writableEnded) return;

    if (!text) {
      send('error', { message: 'No response' });
      if (!res.writableEnded) res.end();
      return;
    }

    const usage = await stream.usage;
    if (usage) recordSpend(estimateCost(usage.promptTokens ?? 0, usage.completionTokens ?? 0));

    const finalText = sanitizeOutput(text);
    send('done', { remaining: quota.remaining, finalText });
    if (!res.writableEnded) res.end();
  } catch (err) {
    console.error('[err]', err instanceof Error ? err.message : err);
    clearInterval(keepalive);
    send('error', { message: 'Agent error' });
    if (!res.writableEnded) res.end();
  }
});

const server = app.listen(PORT, () => console.log(`listening on :${PORT}`));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
