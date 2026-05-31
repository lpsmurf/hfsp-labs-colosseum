import type { Database } from 'better-sqlite3';
import { createAceClient } from '../services/ace-client.js';
import { extractX402Hash, recordX402Payment } from '../services/x402-payments.js';
import { fetchMarketData, fetchMarketContext } from '../services/coingecko.js';
import { insertSignal, logAuditEvent, setAgentRunning } from '../db/migrations.js';
import type { AceService, AgentId, RiskLevel, RunningAgent, SignalAction, TradingSignal } from '../types.js';

type GenerateSignal = (payload: Record<string, unknown>) => Promise<TradingSignal>;

interface AgentLoopOptions {
  agentId: AgentId;
  service: AceService;
  symbol: string;
  generateSignal: GenerateSignal;
  db: Database;
  intervalMs: number;
  once?: boolean;
}

export function startAgentLoop(options: AgentLoopOptions): RunningAgent {
  let running = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  setAgentRunning(options.db, options.agentId, true);
  // Create the Ace client once per agent loop — not per tick — to avoid WebSocket leaks
  const ace = createAceClient();

  const tick = async () => {
    if (!running) return;
    await runAgentOnce(options, ace).catch((error: unknown) => {
      logAuditEvent(options.db, options.agentId, 'agent_tick_failed', {
        service: options.service,
        error: sanitizeError(error),
      });
    });
  };

  void tick();
  if (!options.once) {
    timer = setInterval(() => {
      tick().catch((error: unknown) => {
        logAuditEvent(options.db, options.agentId, 'agent_tick_failed', {
          service: options.service,
          error: sanitizeError(error),
        });
      });
    }, options.intervalMs);
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

export async function runAgentOnce(
  options: AgentLoopOptions,
  ace = createAceClient(),
): Promise<TradingSignal> {
  logAuditEvent(options.db, options.agentId, 'ace_api_call_started', { service: options.service });

  let signal: TradingSignal;
  const sym = options.symbol ?? 'SOL';
  if (options.service === 'search') {
    signal = await runNewsBot(ace, options.agentId, sym, options.db);
  } else if (options.service === 'chat') {
    signal = await runAnalystBot(ace, options.agentId, sym, options.db);
  } else {
    signal = await runContentBot(ace, options.agentId, sym, options.db);
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

async function runNewsBot(ace: ReturnType<typeof createAceClient>, agentId: AgentId, symbol: string, db: Database): Promise<TradingSignal> {
  const result = (await ace.search.google({
    query: `${symbol} cryptocurrency news today price`,
    type: 'news',
    language: 'en',
  })) as Record<string, unknown>;

  const items = (
    (result.news ?? result.organic_results ?? result.news_results ?? result.items ?? []) as Array<Record<string, unknown>>
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
    symbol,
    target_price: 0,
    confidence: 0.5,
    reason: `${symbol} headlines: ${headlines.slice(0, 3).join(' | ')}`,
    risk_level: 'LOW',
    actual_price: 0,
    timestamp: new Date().toISOString(),
    headlines,
    image_url: null,
  };
}

// --- Agent 2 — AnalystBot (chat) ---

async function runAnalystBot(ace: ReturnType<typeof createAceClient>, agentId: AgentId, symbol: string, db: Database): Promise<TradingSignal> {
  // Fetch market data + free context signals in parallel
  const [market, context] = await Promise.all([
    fetchMarketData(symbol),
    fetchMarketContext(symbol).catch(() => null),
  ]);

  const newsRow = db
    .prepare(
      `SELECT headlines FROM trading_signals WHERE agent_id = 'price-monitor' AND symbol = ? AND headlines IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(symbol) as { headlines: string } | undefined;
  const headlines: string[] = newsRow ? (JSON.parse(newsRow.headlines) as string[]) : [];

  // Pull last 3 signals + accuracy for this symbol
  const prevSignals = db.prepare(`
    SELECT action, confidence, outcome_correct FROM trading_signals
    WHERE agent_id = 'portfolio-analyzer' AND symbol = ?
    ORDER BY created_at DESC LIMIT 3
  `).all(symbol) as Array<{ action: string; confidence: number; outcome_correct: number | null }>;

  const accuracyRow = db.prepare(`
    SELECT
      SUM(CASE WHEN outcome_correct = 1 THEN 1 ELSE 0 END) as correct,
      COUNT(*) as total
    FROM trading_signals
    WHERE agent_id = 'portfolio-analyzer' AND symbol = ? AND outcome_recorded = 1
  `).get(symbol) as { correct: number; total: number } | undefined;

  const accuracy = accuracyRow && accuracyRow.total >= 3
    ? `${Math.round((accuracyRow.correct / accuracyRow.total) * 100)}% (${accuracyRow.correct}/${accuracyRow.total})`
    : 'insufficient data';

  const contextSection = context ? `
Technical indicators:
- RSI-14: ${context.rsi14} (${context.rsi14 > 70 ? 'overbought' : context.rsi14 < 30 ? 'oversold' : 'neutral'})
- 7-day momentum: ${context.momentum7d.toFixed(1)}%
- Fear & Greed Index: ${context.fearGreedIndex}/100 (${context.fearGreedLabel})` : '';

  const prevSection = prevSignals.length > 0
    ? `\nPrevious signals (newest first): ${prevSignals.map(s => `${s.action}(${(s.confidence * 100).toFixed(0)}%)`).join(', ')}
Agent accuracy for ${symbol}: ${accuracy}` : '';

  const prompt = `You are a crypto analyst. Respond with ONLY a JSON object — no markdown.

Asset: ${symbol}/USD
Price data:
- Price: $${market.price.toFixed(2)} USD
- 24h change: ${market.change24h.toFixed(2)}%
- Market cap: $${(market.marketCap / 1e9).toFixed(2)}B
- 24h volume: $${(market.volume24h / 1e9).toFixed(2)}B
${contextSection}${prevSection}

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
    symbol,
    target_price: action === 'BUY' ? market.price * 1.05 : action === 'SELL' ? market.price * 0.95 : market.price,
    confidence,
    reason: parsed.reason ?? `${symbol} at $${market.price.toFixed(2)}, ${market.change24h.toFixed(1)}% 24h`,
    risk_level: riskLevel,
    actual_price: market.price,
    timestamp: new Date().toISOString(),
    image_url: null,
    headlines: null,
  };
}

// --- Agent 3 — ContentBot (images) ---

async function runContentBot(ace: ReturnType<typeof createAceClient>, agentId: AgentId, symbol: string, db: Database): Promise<TradingSignal> {
  const signalRow = db
    .prepare(
      `SELECT action, actual_price, confidence, reason FROM trading_signals WHERE agent_id = 'portfolio-analyzer' AND symbol = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(symbol) as { action: string; actual_price: number; confidence: number; reason: string } | undefined;

  const newsRow = db
    .prepare(
      `SELECT headlines FROM trading_signals WHERE agent_id = 'price-monitor' AND symbol = ? AND headlines IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(symbol) as { headlines: string } | undefined;

  const action = signalRow?.action ?? 'HOLD';
  const price = signalRow?.actual_price ?? 0;
  const confidence = Math.round((signalRow?.confidence ?? 0.5) * 100);
  const headlines: string[] = newsRow ? (JSON.parse(newsRow.headlines) as string[]) : [];
  const theme = action === 'BUY' ? 'green bullish' : action === 'SELL' ? 'red bearish' : 'blue neutral';

  const signalPrompt = `Professional crypto trading signal card, dark background, ${theme} color scheme. Large bold text: "${symbol}/USD ${action}". Price $${price.toFixed(2)}. Confidence ${confidence}%. Clawdrop branding. Clean minimal design, no people, no faces.`;

  const newsPrompt = `Daily ${symbol} crypto news digest card, dark crypto aesthetic, professional infographic. Show these headlines as a list: ${headlines.slice(0, 4).join(' • ')}. Clawdrop branding. No people, no faces.`;

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
    symbol,
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
