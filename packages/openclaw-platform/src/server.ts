import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { db } from './db/index.js';

const EnvSchema = z.object({
  PORT: z.string().default('8788'),
  JWT_SECRET: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  PLATFORM_WALLET_ADDRESS: z.string().min(1),
  VAULT_ENCRYPTION_KEY: z.string().min(32),
  POLY_OPENROUTER_KEY: z.string().optional(),
});

const env = EnvSchema.safeParse(process.env);
if (!env.success) {
  console.error('Missing ENV vars:', env.error.format());
  process.exit(1);
}

// Init DB on startup
db();

const PORT = parseInt(env.data.PORT, 10);
const app = express();
app.use(express.json());

const ORIGINS = ['https://clawdrop.live', 'http://localhost:3000', 'http://localhost:5173'];
app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  if (ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Routes
import authRouter from './routes/auth.js';
import subscriptionsRouter from './routes/subscriptions.js';
import paymentsRouter from './routes/payments.js';
import agentsRouter from './routes/agents.js';
import usageRouter from './routes/usage.js';

app.use('/api/auth', authRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/usage', usageRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', service: 'openclaw-platform' });
});

app.listen(PORT, () => console.log(`openclaw-platform listening on :${PORT}`));
