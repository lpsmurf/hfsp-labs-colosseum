import express, { type Request, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { AGENT_DEFINITIONS, getAgentDefinition, loadConfig, missingRuntimeSecrets } from './config.js';
import { initializeDatabase } from './db/schema.js';
import { logAuditEvent, seedAgents } from './db/migrations.js';
import { registerAgentOnSAP, registerAllAgentsOnSAP } from './services/sap-registry.js';
import { buildSignerFromPrivateKey } from './services/x402-payments.js';
import { startPriceMonitorAgent } from './agents/price-monitor.js';
import { startPortfolioAnalyzerAgent } from './agents/portfolio-analyzer.js';
import { startSentimentMonitorAgent } from './agents/sentiment-monitor.js';
import { startTrendingAgent } from './agents/trending-agent.js';
import { startOutcomeChecker } from './agents/outcome-checker.js';
import { startPredictionMarketsAgent } from './agents/prediction-markets-agent.js';
import { startNewsDigestAgent } from './agents/news-digest-agent.js';
import { startPaperBetMonitor } from './agents/paper-bet-monitor.js';
import { startCryptoNewsDigest } from './agents/crypto-news-digest.js';
import { getAllBets, getPnL } from './services/paper-trading.js';
import { TRACKED_SYMBOLS } from './config.js';
import type { AgentId, RunningAgent } from './types.js';

const startedAt = Date.now();
const runningAgents = new Map<AgentId, RunningAgent>();

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await initializeDatabase(config.databasePath);
  seedAgents(db);

  const signer = buildOptionalSigner(config.walletPrivateKey);
  await registerAllAgentsOnSAP(db, signer);

  const missingSecrets = missingRuntimeSecrets(config);
  if (config.startAgents && missingSecrets.length === 0) {
    startAllAgents(db, config.agentIntervalMs);
  } else {
    logAuditEvent(db, null, 'agents_not_started', {
      reason: config.startAgents ? 'missing runtime secrets' : 'START_AGENTS=false',
      missing: missingSecrets,
    });
  }

  const app = buildApp(db);
  const server = app.listen(config.port, () => {
    console.info(`oobe-bounty backend listening on :${config.port}`);
  });

  const shutdown = () => {
    for (const agent of runningAgents.values()) agent.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function buildApp(db: Database): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    const missing = missingRuntimeSecrets();
    res.json({
      status: missing.length === 0 ? 'healthy' : 'degraded',
      uptime: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
      agentsRunning: runningAgents.size,
      missingEnv: missing,
    });
  });

  app.post('/api/agents/register', async (req: Request, res: Response) => {
    try {
      const body = req.body as { agentId?: AgentId };
      const signer = buildOptionalSigner(loadConfig().walletPrivateKey);
      if (body.agentId) {
        const definition = getAgentDefinition(body.agentId);
        const result = await registerAgentOnSAP(definition, signer, db);
        return res.json({ success: true, agentId: body.agentId, sapId: result.sapId, explorerUrl: result.explorerUrl, pending: result.pending });
      }

      const results = await registerAllAgentsOnSAP(db, signer);
      return res.json({
        success: true,
        sapId: results[0]?.sapId ?? null,
        explorerUrl: results[0]?.explorerUrl ?? null,
        agents: results,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: safeMessage(error) });
    }
  });

  app.get('/api/agents/status', (_req: Request, res: Response) => {
    const agents = db.prepare(`
      SELECT id, name, sap_id, capabilities, endpoint, service, running, last_signal_time, created_at, updated_at
      FROM agents
      ORDER BY id ASC
    `).all() as AgentRow[];

    res.json({
      agents: agents.map((agent) => ({
        agentId: agent.id,
        name: agent.name,
        sapId: agent.sap_id,
        capabilities: JSON.parse(agent.capabilities) as string[],
        endpoint: agent.endpoint,
        service: agent.service,
        running: agent.running === 1,
        lastSignal: agent.last_signal_time,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
      })),
    });
  });

  app.get('/api/signals', (req: Request, res: Response) => {
    const hours = parseHours(req.query.hours);
    const rows = db.prepare(`
      SELECT id, agent_id, service, action, symbol, target_price, confidence, reason,
             risk_level, actual_price, outcome_recorded, outcome_correct, created_at, outcome_at,
             posted_to_twitter, posted_to_telegram, trending_data
      FROM trading_signals
      WHERE created_at >= datetime('now', ?)
      ORDER BY created_at DESC
    `).all(`-${hours} hours`) as SignalRow[];

    res.json({
      signals: rows.map((row) => ({
        id: row.id,
        agentId: row.agent_id,
        service: row.service,
        action: row.action,
        target_price: row.target_price,
        confidence: row.confidence,
        reason: row.reason,
        risk_level: row.risk_level,
        actual_price: row.actual_price,
        outcome_recorded: row.outcome_recorded === 1,
        timestamp: row.created_at,
        outcome_at: row.outcome_at,
        posted_to_twitter: row.posted_to_twitter === 1,
        posted_to_telegram: row.posted_to_telegram === 1,
      })),
    });
  });

  app.get('/api/payments', (req: Request, res: Response) => {
    const hours = parseHours(req.query.hours);
    const rows = db.prepare(`
      SELECT id, agent_id, service, tokens_used, sol_amount, tx_signature, status, error, created_at, confirmed_at
      FROM payments
      WHERE created_at >= datetime('now', ?)
      ORDER BY created_at DESC
    `).all(`-${hours} hours`) as PaymentRow[];

    res.json({
      payments: rows.map((row) => ({
        id: row.id,
        agentId: row.agent_id,
        service: row.service,
        tokensUsed: row.tokens_used,
        solAmount: row.sol_amount,
        txSignature: row.tx_signature,
        status: row.status,
        error: row.error,
        createdAt: row.created_at,
        confirmedAt: row.confirmed_at,
      })),
    });
  });

  app.get('/api/paper-bets', (req: Request, res: Response) => {
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days ?? '3'), 10)));
    const bets = getAllBets(db, days);
    const pnl  = getPnL(db, days);
    res.json({ pnl, bets });
  });

  app.get('/api/proof', (_req: Request, res: Response) => {
    const paymentStats = db.prepare(`
      SELECT
        COUNT(*) AS total_transactions,
        COUNT(DISTINCT service) AS distinct_services,
        COALESCE(SUM(sol_amount), 0) AS sol_spent,
        MIN(created_at) AS first_payment_at,
        MAX(created_at) AS last_payment_at
      FROM payments
      WHERE status = 'confirmed'
    `).get() as ProofStatsRow;
    const signalStats = db.prepare(`
      SELECT COUNT(*) AS total_signals, MIN(created_at) AS first_signal_at, MAX(created_at) AS last_signal_at
      FROM trading_signals
    `).get() as SignalStatsRow;
    const services = db.prepare(`
      SELECT service, COUNT(*) AS transactions, COALESCE(SUM(sol_amount), 0) AS sol_spent
      FROM payments
      WHERE status = 'confirmed'
      GROUP BY service
      ORDER BY service ASC
    `).all() as ServiceProofRow[];
    const samples = db.prepare(`
      SELECT tx_signature, service, sol_amount, created_at
      FROM payments
      WHERE status = 'confirmed' AND tx_signature IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    `).all() as TxSampleRow[];

    res.json({
      totalTransactions: paymentStats.total_transactions,
      distinctServices: paymentStats.distinct_services,
      solSpent: paymentStats.sol_spent,
      firstPaymentAt: paymentStats.first_payment_at,
      lastPaymentAt: paymentStats.last_payment_at,
      signals: {
        total: signalStats.total_signals,
        firstSignalAt: signalStats.first_signal_at,
        lastSignalAt: signalStats.last_signal_at,
      },
      services,
      sampleTransactions: samples.map((sample) => ({
        txSignature: sample.tx_signature,
        service: sample.service,
        solAmount: sample.sol_amount,
        createdAt: sample.created_at,
        solscanUrl: sample.tx_signature ? `https://solscan.io/tx/${sample.tx_signature}` : null,
      })),
    });
  });

  return app;
}

function startAllAgents(db: Database, intervalMs: number): void {
  const context = { db, intervalMs };

  // Start signal agents staggered (10s apart) to avoid CoinGecko rate limits
  for (let i = 0; i < TRACKED_SYMBOLS.length; i++) {
    const symbol = TRACKED_SYMBOLS[i];
    const delayMs = i * 45_000; // 45s apart — prevents concurrent Synapse RPC calls
    setTimeout(() => {
      const symbolContext = { ...context, symbol };
      startPriceMonitorAgent(symbolContext);
      startPortfolioAnalyzerAgent(symbolContext);
      startSentimentMonitorAgent(symbolContext);
    }, delayMs);
  }

  // Trending agent — posts top 10 trending twice a day
  const trending = startTrendingAgent(db);
  runningAgents.set(trending.agentId, trending);

  // Prediction markets — screens Polymarket + Kalshi, places $10 paper bets
  const predictions = startPredictionMarketsAgent(db);
  runningAgents.set(predictions.agentId, predictions);

  // Paper bet monitor — checks resolutions every 30 min, posts results
  startPaperBetMonitor(db);

  // Combined crypto news digest — ONE message for SOL+BTC+ETH at 9am and 5pm NY
  startCryptoNewsDigest(db);

  // News digest — top 10 crypto/SOL/prediction markets news at 9am NY every day
  startNewsDigestAgent(db);

  // Outcome checker — measures signal accuracy every 30 min
  startOutcomeChecker(db);

  logAuditEvent(db, null, 'agents_started', {
    symbols: TRACKED_SYMBOLS,
    agentIds: AGENT_DEFINITIONS.map((agent) => agent.id),
    intervalMs,
  });
}

function buildOptionalSigner(privateKey: string): unknown {
  try {
    return buildSignerFromPrivateKey(privateKey);
  } catch {
    return null;
  }
}

function parseHours(value: unknown): number {
  const firstValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(typeof firstValue === 'string' ? firstValue : '24', 10);
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(24 * 30, Math.max(1, parsed));
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/([A-Za-z0-9_-]{24,})/g, '[redacted]');
}

interface AgentRow {
  id: string;
  name: string;
  sap_id: string | null;
  capabilities: string;
  endpoint: string;
  service: string;
  running: number;
  last_signal_time: string | null;
  created_at: string;
  updated_at: string;
}

interface SignalRow {
  id: string;
  agent_id: string;
  service: string;
  action: string;
  target_price: number;
  confidence: number;
  reason: string;
  risk_level: string;
  actual_price: number;
  outcome_recorded: number;
  created_at: string;
  outcome_at: string | null;
  posted_to_twitter: number;
  posted_to_telegram: number;
}

interface PaymentRow {
  id: string;
  agent_id: string;
  service: string;
  tokens_used: number;
  sol_amount: number;
  tx_signature: string | null;
  status: string;
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
}

interface ProofStatsRow {
  total_transactions: number;
  distinct_services: number;
  sol_spent: number;
  first_payment_at: string | null;
  last_payment_at: string | null;
}

interface SignalStatsRow {
  total_signals: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
}

interface ServiceProofRow {
  service: string;
  transactions: number;
  sol_spent: number;
}

interface TxSampleRow {
  tx_signature: string | null;
  service: string;
  sol_amount: number;
  created_at: string;
}

void main().catch((error: unknown) => {
  console.error(`oobe-bounty backend failed to start: ${safeMessage(error)}`);
  process.exit(1);
});
