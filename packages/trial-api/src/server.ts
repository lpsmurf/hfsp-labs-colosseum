import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { polyAgent, getSessionMessages, appendMessage } from './poly-agent.js';
import { checkAndIncrement, getQuota } from './rate-limit.js';
import { isBudgetExhausted, recordSpend, getRemainingBudget, estimateSpend } from './budget-guard.js';
import { env } from './env.js';
import logger from './utils/logger.js';

const app = express();

// Trust proxy if configured (nginx X-Real-IP)
if (env.TRUST_PROXY) {
  app.set('trust proxy', true);
}

// CORS
const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

function getClientIp(req: Request): string {
  // Prefer nginx X-Real-IP, fallback to express trust proxy chain
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  return req.ip ?? 'unknown';
}

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    budget_remaining: getRemainingBudget(),
  });
});

// Quota check
app.get('/api/quota', (req, res) => {
  const ip = String(req.query.ip || getClientIp(req));
  const quota = getQuota(ip);
  res.status(200).json(quota);
});

// Chat endpoint — SSE streaming
app.post('/api/chat', async (req, res) => {
  const ip = getClientIp(req);
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing or invalid message' });
    return;
  }

  // Rate limit by IP
  const quota = checkAndIncrement(ip);
  if (!quota.allowed) {
    res.status(429).json({ error: 'Daily message limit reached', retry_after: 'UTC midnight' });
    return;
  }

  // Budget guard
  if (isBudgetExhausted()) {
    res.status(429).json({ error: 'Trial budget exhausted for today', retry_after: 'UTC midnight' });
    return;
  }

  // Start SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const safeSessionId = typeof sessionId === 'string' ? sessionId : 'anon';
  const messages = getSessionMessages(safeSessionId);

  // Add user message to history
  appendMessage(safeSessionId, { role: 'user', content: message });

  // Build Mastra-compatible message list
  const history = [
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  let responseText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  // Hard timeout to prevent hung connections
  const streamTimeout = setTimeout(() => {
    if (!res.writableEnded) {
      logger.warn({ ip: ip.replace(/\d+$/, 'xxx'), sessionId: safeSessionId }, 'Stream timed out');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Response timed out' }) }\n\n`);
      res.end();
    }
  }, 15000);

  try {
    const streamResult = await polyAgent.streamLegacy(history, {
      runId: `${safeSessionId}-${Date.now()}`,
    });

    // Stream text chunks
    for await (const chunk of streamResult.textStream) {
      if (clientDisconnected) {
        logger.info({ ip: ip.replace(/\d+$/, 'xxx') }, 'Client disconnected, aborting stream');
        break;
      }
      responseText += chunk;
      res.write(`data: ${JSON.stringify({ type: 'text', chunk }) }\n\n`);
      // Force flush for SSE immediacy
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }

    clearTimeout(streamTimeout);

    // If stream ended without any content, treat as error (don't await usage, it may hang)
    if (!responseText) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'No response generated' }) }\n\n`);
      res.end();
      return;
    }

    // Get usage for budget tracking
    const usage = await streamResult.usage;
    if (usage) {
      inputTokens = (usage as any).promptTokens ?? (usage as any).inputTokens ?? 0;
      outputTokens = (usage as any).completionTokens ?? (usage as any).outputTokens ?? 0;
    }

    // Send finish event
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type: 'done', remaining: quota.remaining }) }\n\n`);
      res.end();
    }

    // Save assistant response to session
    appendMessage(safeSessionId, { role: 'assistant', content: responseText });

    // Record estimated spend
    const estimated = estimateSpend(inputTokens, outputTokens);
    recordSpend(estimated);

    logger.info(
      {
        ip: ip.replace(/\d+$/, 'xxx'),
        sessionId: safeSessionId,
        inputTokens,
        outputTokens,
        estimatedSpend: estimated.toFixed(6),
      },
      'Chat completed'
    );
  } catch (error) {
    clearTimeout(streamTimeout);
    logger.error({ error, ip: ip.replace(/\d+$/, 'xxx'), sessionId: safeSessionId }, 'Chat stream error');
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' }) }\n\n`);
      res.end();
    }
  }
});

const PORT = Number(env.PORT);
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, env: env.NODE_ENV }, 'Trial API listening');
});
