import type { Database } from 'better-sqlite3';
import { fetchTrendingTokens } from '../services/coingecko.js';
import { insertSignal, logAuditEvent, setAgentRunning } from '../db/migrations.js';
import { createAceClient } from '../services/ace-client.js';
import { extractX402Hash, recordX402Payment } from '../services/x402-payments.js';
import { TRENDING_INTERVAL_MS } from '../config.js';
import type { TrendingToken, RunningAgent } from '../types.js';

export function startTrendingAgent(db: Database): RunningAgent {
  let running = true;
  setAgentRunning(db, 'trending-agent', true);

  const tick = async () => {
    if (!running) return;
    try {
      const tokens = await fetchTrendingTokens();

      logAuditEvent(db, 'trending-agent', 'trending_fetch', {
        count: tokens.length,
        top3: tokens.slice(0, 3).map(t => t.symbol),
      });

      // LLM: generate 1-line insights for top 5 tokens (x402 payment)
      const tokenInsights = await generateTrendingInsights(db, tokens.slice(0, 5));

      // Attach insights to token objects
      const enrichedTokens = tokens.map(t => ({
        ...t,
        insight: tokenInsights[t.symbol] ?? null,
      }));

      const top3 = tokens.slice(0, 3).map(t => {
        const dir = t.change24h >= 0 ? '+' : '';
        return `${t.symbol} ${dir}${t.change24h.toFixed(1)}%`;
      }).join(', ');

      insertSignal(db, {
        agentId: 'trending-agent',
        service: 'search',
        action: 'HOLD',
        symbol: 'MARKET',
        target_price: 0,
        confidence: 1,
        reason: `Top trending: ${top3}`,
        risk_level: 'LOW',
        actual_price: 0,
        timestamp: new Date().toISOString(),
        image_url: null,
        headlines: null,
        trending_data: enrichedTokens,
      });

    } catch (error) {
      logAuditEvent(db, 'trending-agent', 'trending_fetch_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Fire immediately on start, then every 12h
  void tick();
  const timer = setInterval(() => void tick(), TRENDING_INTERVAL_MS);

  return {
    agentId: 'trending-agent',
    running,
    stop: () => {
      running = false;
      clearInterval(timer);
      setAgentRunning(db, 'trending-agent', false);
    },
  };
}

async function generateTrendingInsights(
  db: Database,
  tokens: TrendingToken[],
): Promise<Record<string, string>> {
  try {
    const ace = createAceClient();
    const tokenList = tokens.map(t => {
      const dir = t.change24h >= 0 ? '+' : '';
      const price = t.price > 0 ? ` @ $${t.price < 0.01 ? t.price.toFixed(6) : t.price.toFixed(2)}` : '';
      return `${t.rank}. ${t.symbol} (${t.name})${price} — ${dir}${t.change24h.toFixed(1)}% 24h`;
    }).join('\n');

    const prompt = `You are a crypto analyst. For each trending token below, write ONE short insight (max 12 words) explaining WHY it's trending. Focus on the driver: new listing, protocol upgrade, meme momentum, whale activity, partnership, etc. Be specific, not generic.

${tokenList}

Reply ONLY with JSON where keys are token symbols:
{"BONK":"New Raydium pool listing driving retail FOMO","HYPE":"Hyperliquid TVL hit $1B milestone"}`;

    const completion = await ace.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
    }) as Record<string, unknown>;

    const x402Hash = extractX402Hash(completion);
    recordX402Payment('trending-agent', 'chat', x402Hash, db);

    const choice = (completion.choices as Array<Record<string, unknown>>)?.[0];
    const raw = String((choice?.message as Record<string, unknown> | undefined)?.content ?? '{}');
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as Record<string, string>;
  } catch {
    return {};
  }
}
