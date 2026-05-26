import type { Database } from 'better-sqlite3';
import { createAceClient } from '../services/ace-client.js';
import { extractX402Hash, recordX402Payment } from '../services/x402-payments.js';
import { fetchSolanaMarketData } from '../services/coingecko.js';
import { insertSignal, logAuditEvent, setAgentRunning } from '../db/migrations.js';
import type { AceService, AgentId, RiskLevel, RunningAgent, SignalAction, TradingSignal } from '../types.js';

type GenerateSignal = (payload: Record<string, unknown>) => Promise<TradingSignal>;

interface AgentLoopOptions {
  agentId: AgentId;
  service: AceService;
  generateSignal: GenerateSignal;
  db: Database;
  intervalMs: number;
  once?: boolean;
}

export function startAgentLoop(options: AgentLoopOptions): RunningAgent {
  let running = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  setAgentRunning(options.db, options.agentId, true);

  const tick = async () => {
    if (!running) return;
    await runAgentOnce(options).catch((error: unknown) => {
      logAuditEvent(options.db, options.agentId, 'agent_tick_failed', {
        service: options.service,
        error: sanitizeError(error),
      });
    });
  };

  void tick();
  if (!options.once) {
    timer = setInterval(() => void tick(), options.intervalMs);
  }

  return {
    agentId: options.agentId,
    running,
    stop: () => {
      running = false;
      if (timer) clearInterval(timer);
      setAgentRunning(options.db, options.agentId, false);
      logAuditEvent(options.db, options.agentId, 'agent_stopped', { service: options.service });
    },
  };
}

export async function runAgentOnce(options: AgentLoopOptions): Promise<TradingSignal> {
  const ace = createAceClient();
  logAuditEvent(options.db, options.agentId, 'ace_api_call_started', { service: options.service });

  let signal: TradingSignal;
  if (options.service === 'search') {
    signal = await runNewsBot(ace, options.agentId, options.db);
  } else if (options.service === 'chat') {
    signal = await runAnalystBot(ace, options.agentId, options.db);
  } else {
    signal = await runContentBot(ace, options.agentId, options.db);
  }

  insertSignal(options.db, signal);
  logAuditEvent(options.db, options.agentId, 'signal_generated', {
    service: options.service,
    action: signal.action,
    confidence: signal.confidence,
  });
  return signal;
}

// --- Agent 1 — NewsBot (search) ---

async function runNewsBot(ace: ReturnType<typeof createAceClient>, agentId: AgentId, db: Database): Promise<TradingSignal> {
  const result = (await ace.search.google({
    query: 'Solana SOL cryptocurrency news today',
    type: 'news',
    language: 'en',
  })) as Record<string, unknown>;

  const items = (
    (result.organic_results ?? result.news_results ?? result.items ?? []) as Array<Record<string, unknown>>
  );
  const headlines = items
    .slice(0, 8)
    .map((r) => String(r.title ?? r.snippet ?? ''))
    .filter(Boolean);

  const x402Hash = extractX402Hash(result);
  recordX402Payment(agentId, 'search', x402Hash, db);

  return {
    agentId,
    service: 'search',
    action: 'HOLD',
    target_price: 0,
    confidence: 0.5,
    reason: `Solana headlines: ${headlines.slice(0, 3).join(' | ')}`,
    risk_level: 'LOW',
    actual_price: 0,
    timestamp: new Date().toISOString(),
    headlines,
    image_url: null,
  };
}

// --- Agent 2 — AnalystBot (chat) ---

async function runAnalystBot(ace: ReturnType<typeof createAceClient>, agentId: AgentId, db: Database): Promise<TradingSignal> {
  const market = await fetchSolanaMarketData();

  const newsRow = db
    .prepare(
      `SELECT headlines FROM trading_signals WHERE agent_id = 'price-monitor' AND headlines IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { headlines: string } | undefined;
  const headlines: string[] = newsRow ? (JSON.parse(newsRow.headlines) as string[]) : [];

  const prompt = `You are a Solana crypto analyst. Respond with ONLY a JSON object — no markdown.

Market data:
- Price: $${market.price.toFixed(2)} USD
- 24h change: ${market.change24h.toFixed(2)}%
- Market cap: $${(market.marketCap / 1e9).toFixed(2)}B
- 24h volume: $${(market.volume24h / 1e9).toFixed(2)}B

Recent headlines:
${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n') || 'No recent headlines.'}

Respond with exactly:
{"action":"BUY","confidence":0.75,"reason":"one sentence under 100 chars","risk_level":"MEDIUM"}
action must be BUY, SELL, or HOLD. confidence between 0.5 and 0.99.`;

  const completion = (await ace.openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 120,
  })) as Record<string, unknown>;

  const choice = (completion.choices as Array<Record<string, unknown>>)?.[0];
  const raw = String((choice?.message as Record<string, unknown> | undefined)?.content ?? '{}');
  const parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim()) as {
    action?: string;
    confidence?: number;
    reason?: string;
    risk_level?: string;
  };

  const action = (['BUY', 'SELL', 'HOLD'].includes(parsed.action ?? '') ? parsed.action : 'HOLD') as SignalAction;
  const confidence = Math.min(0.99, Math.max(0.5, parsed.confidence ?? 0.6));
  const riskLevel = (['LOW', 'MEDIUM', 'HIGH'].includes(parsed.risk_level ?? '') ? parsed.risk_level : 'MEDIUM') as RiskLevel;

  const x402Hash = extractX402Hash(completion);
  recordX402Payment(agentId, 'chat', x402Hash, db);

  return {
    agentId,
    service: 'chat',
    action,
    target_price: action === 'BUY' ? market.price * 1.05 : action === 'SELL' ? market.price * 0.95 : market.price,
    confidence,
    reason: parsed.reason ?? `SOL at $${market.price.toFixed(2)}, ${market.change24h.toFixed(1)}% 24h`,
    risk_level: riskLevel,
    actual_price: market.price,
    timestamp: new Date().toISOString(),
    image_url: null,
    headlines: null,
  };
}

// --- Agent 3 — ContentBot (images) ---

async function runContentBot(ace: ReturnType<typeof createAceClient>, agentId: AgentId, db: Database): Promise<TradingSignal> {
  const signalRow = db
    .prepare(
      `SELECT action, actual_price, confidence, reason FROM trading_signals WHERE agent_id = 'portfolio-analyzer' ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { action: string; actual_price: number; confidence: number; reason: string } | undefined;

  const newsRow = db
    .prepare(
      `SELECT headlines FROM trading_signals WHERE agent_id = 'price-monitor' AND headlines IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { headlines: string } | undefined;

  const action = signalRow?.action ?? 'HOLD';
  const price = signalRow?.actual_price ?? 0;
  const confidence = Math.round((signalRow?.confidence ?? 0.5) * 100);
  const headlines: string[] = newsRow ? (JSON.parse(newsRow.headlines) as string[]) : [];
  const theme = action === 'BUY' ? 'green bullish' : action === 'SELL' ? 'red bearish' : 'blue neutral';

  const signalPrompt = `Professional crypto trading signal card, dark background, ${theme} color scheme. Large bold text: "SOL/USD ${action}". Price $${price.toFixed(2)}. Confidence ${confidence}%. Clawdrop branding. Clean minimal design, no people, no faces.`;

  const newsPrompt = `Daily Solana news digest card, dark crypto aesthetic, professional infographic. Show these headlines as a list: ${headlines.slice(0, 4).join(' • ')}. Clawdrop branding. No people, no faces.`;

  async function genImage(prompt: string): Promise<string | null> {
    const taskOrResult = (await ace.images.generate({ prompt, provider: 'flux' })) as Record<string, unknown> & {
      wait?: () => Promise<Record<string, unknown>>;
    };
    const result = typeof taskOrResult.wait === 'function' ? await taskOrResult.wait() : taskOrResult;
    const x402Hash = extractX402Hash(result);
    recordX402Payment(agentId, 'images', x402Hash, db);
    return (result.image_url ?? result.url ?? result.imageUrl ?? null) as string | null;
  }

  const [signalImageUrl, newsImageUrl] = await Promise.all([genImage(signalPrompt), genImage(newsPrompt)]);

  return {
    agentId,
    service: 'images',
    action: action as SignalAction,
    target_price: price,
    confidence: signalRow?.confidence ?? 0.5,
    reason: `Signal card ready | news_image:${newsImageUrl ?? 'pending'}`,
    risk_level: 'LOW',
    actual_price: price,
    timestamp: new Date().toISOString(),
    image_url: signalImageUrl,
    headlines: null,
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/([A-Za-z0-9_-]{24,})/g, '[redacted]');
}
