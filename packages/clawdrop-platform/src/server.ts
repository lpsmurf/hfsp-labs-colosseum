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
import internalRouter from './routes/internal.js';

app.use('/api/auth', authRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/usage', usageRouter);
app.use('/api/internal', internalRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', service: 'clawdrop-platform' });
});

// Serve OpenAPI spec for pay-skills registry
app.get('/api/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'Openclaw Platform API',
      description: 'Deploy and manage autonomous Solana AI agents. Subscription management, payments, agent orchestration, and token usage tracking.',
      version: '0.1.0',
      contact: { name: 'Openclaw', url: 'https://clawdrop.live' },
    },
    servers: [{ url: 'https://clawdrop.live/api/platform', description: 'Production' }],
    paths: {
      '/auth/login': {
        post: {
          summary: 'Authenticate with wallet',
          description: 'Login using a Solana wallet address. Returns a JWT token.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    wallet_address: { type: 'string', description: 'Solana wallet address' },
                    signature: { type: 'string' },
                    message: { type: 'string' },
                  },
                  required: ['wallet_address'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Login successful' },
          },
        },
      },
      '/subscriptions': {
        get: {
          summary: 'Get active subscription',
          description: 'Returns the active subscription. 404 if none.',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Active subscription' },
            '404': { description: 'No active subscription' },
          },
        },
      },
      '/payments/verify': {
        post: {
          summary: 'Verify Solana payment',
          description: 'Verify an on-chain tx and create/extend subscription.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tx_signature: { type: 'string' },
                    tier: { type: 'string', enum: ['starter', 'pro'] },
                    token: { type: 'string', enum: ['SOL', 'USDC', 'USDT', 'HERD'] },
                    wallet_address: { type: 'string' },
                  },
                  required: ['tx_signature', 'tier', 'token', 'wallet_address'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Payment verified' },
            '400': { description: 'Verification failed' },
          },
        },
      },
      '/payments/quote': {
        get: {
          summary: 'Get payment quote',
          parameters: [
            { name: 'tier', in: 'query', required: true, schema: { type: 'string', enum: ['starter', 'pro'] } },
          ],
          responses: { '200': { description: 'Price quote' } },
        },
      },
      '/agents': {
        get: {
          summary: 'List agents',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'List of agents' } },
        },
      },
      '/agents/deploy': {
        post: {
          summary: 'Deploy agent',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    llm_provider: { type: 'string', enum: ['poly', 'byok', 'custom'] },
                    llm_model: { type: 'string' },
                    custom_endpoint: { type: 'string' },
                  },
                  required: ['name', 'llm_provider'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Agent deployed' },
            '403': { description: 'Subscription required' },
            '409': { description: 'Agent already running' },
          },
        },
      },
      '/agents/{id}': {
        delete: {
          summary: 'Stop agent',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Agent stopped' }, '404': { description: 'Not found' } },
        },
      },
      '/usage/tokens': {
        get: {
          summary: 'Token usage',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Token usage stats' } },
        },
      },
      '/health': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'Service healthy' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  });
});

app.listen(PORT, () => console.log(`clawdrop-platform listening on :${PORT}`));
