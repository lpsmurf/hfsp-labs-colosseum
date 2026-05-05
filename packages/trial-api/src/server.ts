import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { poly } from './poly-agent.js';
import { checkAndIncrement, getQuota } from './rate-limit.js';
import { isBudgetExhausted, getBudgetRemaining, recordSpend, estimateCost } from './budget-guard.js';

// ── ENV validation ──────────────────────────────────────────────────────────
const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  PORT: z.string().default('8787'),
  TRUST_PROXY: z.string().optional(),
});

const env = EnvSchema.safeParse(process.env);
if (!env.success) {
  console.error('Missing required ENV vars:', env.error.format());
  process.exit(1);
}

const PORT = parseInt(env.data.PORT, 10);
const ALLOWED_ORIGINS = ['https://clawdrop.live', 'http://localhost:3000', 'http://localhost:5173'];

// ── App ─────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

if (env.data.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return void res.sendStatus(204);
  next();
}
app.use(cors);

function clientIp(req: Request): string {
  return (req.headers['x-real-ip'] as string) ?? req.ip ?? '0.0.0.0';
}

// ── GET /health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', budget_remaining: getBudgetRemaining() });
});

// ── GET /api/quota ───────────────────────────────────────────────────────────
app.get('/api/quota', (req, res) => {
  const ip = (req.query['ip'] as string) ?? clientIp(req);
  res.json(getQuota(ip));
});

// ── POST /api/chat (SSE) ─────────────────────────────────────────────────────
const ChatSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(1).max(64),
});

app.post('/api/chat', async (req, res) => {
  const parse = ChatSchema.safeParse(req.body);
  if (!parse.success) {
    return void res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  const ip = clientIp(req);

  if (isBudgetExhausted()) {
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    return void res.status(429).json({
      error: 'Daily budget exhausted',
      retry_after: midnight.toISOString(),
    });
  }

  const quota = checkAndIncrement(ip);
  if (!quota.allowed) {
    return void res.status(429).json({
      error: 'Daily message limit reached',
      remaining: 0,
      resets_at: quota.resets_at,
    });
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const stream = await poly.stream(parse.data.message);

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream.textStream) {
      if (closed) break;
      send('delta', { text: chunk });
    }

    const usage = await stream.usage;
    if (usage) {
      inputTokens = usage.promptTokens ?? 0;
      outputTokens = usage.completionTokens ?? 0;
    }

    const cost = estimateCost(inputTokens, outputTokens);
    recordSpend(cost);

    if (!closed) {
      send('done', { remaining: quota.remaining, input_tokens: inputTokens, output_tokens: outputTokens });
      res.end();
    }
  } catch (err) {
    console.error('[chat error]', err instanceof Error ? err.message : err);
    if (!closed && !res.writableEnded) {
      send('error', { message: 'Agent error, please try again.' });
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`trial-api listening on :${PORT}`);
});
