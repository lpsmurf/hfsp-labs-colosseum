import { Telegraf } from 'telegraf';
import {
  getUnpostedSignals,
  markSignalPosted,
  markSignalError,
  getSignalCount,
} from './db.js';
import type { TradingSignal, TelegramMetrics } from './types.js';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes cap

let running = false;
let messagesCount = 0;
let lastMessageTime = 0;
let retryDelay = 5000;
let bot: Telegraf | null = null;

function getBot(): Telegraf {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not set');
    }
    bot = new Telegraf(token);
  }
  return bot;
}

function getChannelId(): string {
  const id = process.env.TELEGRAM_CHANNEL_ID;
  if (!id) {
    throw new Error('TELEGRAM_CHANNEL_ID not set');
  }
  return id;
}

function getAccuracyLine(db?: import('better-sqlite3').Database): string {
  if (!db) return '';
  try {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN outcome_correct = 1 THEN 1 ELSE 0 END) as correct,
        COUNT(*) as total
      FROM trading_signals WHERE outcome_recorded = 1
    `).get() as { correct: number; total: number };
    if (!row || row.total < 3) return '';
    const pct = Math.round((row.correct / row.total) * 100);
    return `\n🎯 Agent accuracy: ${pct}% (${row.correct}/${row.total} calls)`;
  } catch { return ''; }
}

function formatTrendingMessage(signal: TradingSignal): string {
  let tokens: Array<{ rank: number; symbol: string; name: string; change24h: number; price: number }> = [];
  try { tokens = JSON.parse(signal.trending_data ?? '[]') as typeof tokens; } catch { /* empty */ }

  const rows = tokens.slice(0, 10).map(t => {
    const emoji = t.change24h >= 5 ? '🚀' : t.change24h >= 0 ? '🟢' : t.change24h >= -5 ? '🔴' : '💥';
    const dir = t.change24h >= 0 ? '+' : '';
    const price = t.price > 0 ? ` @ $${t.price < 0.01 ? t.price.toFixed(6) : t.price.toFixed(2)}` : '';
    const insight = (t as typeof t & { insight?: string }).insight;
    const insightLine = insight ? `\n   _${insight}_` : '';
    // No cashtags or hashtags
    return `${t.rank}. ${emoji} ${t.symbol} — ${dir}${t.change24h.toFixed(1)}%${price}${insightLine}`;
  });

  return [
    `🔥 **TOP 10 TRENDING TOKENS RIGHT NOW**`,
    ``,
    ...rows,
    ``,
    `🕐 ${new Date(signal.created_at).toUTCString()}`,
  ].join('\n');
}

let _db: import('better-sqlite3').Database | undefined;
export function setDb(db: import('better-sqlite3').Database): void { _db = db; }

function formatPredictionMessage(signal: TradingSignal): string {
  let data: PredMarketData | null = null;
  try { data = JSON.parse(signal.reason) as PredMarketData; } catch { /* fallback */ }
  if (!data) return signal.reason;

  const probPct = Math.round(data.probability * 100);
  const volStr = data.volume >= 1_000_000
    ? `$${(data.volume / 1_000_000).toFixed(1)}M`
    : `$${(data.volume / 1000).toFixed(0)}K`;
  const sourceLabel = data.source === 'kalshi' ? 'Kalshi' : 'Polymarket';
  const total = Math.round(100 / data.probability);
  const profit = total - 100;
  const winnings = `💰 Bet $100 → get back $${total} (+$${profit} profit)`;

  const timeStr = data.hoursLeft >= 48
    ? `${Math.round(data.hoursLeft / 24)} days`
    : `${data.hoursLeft}h`;
  const urgentHeader = data.urgent
    ? `🚨 **CLOSING IN ${timeStr} — ACT NOW**`
    : `🎰 **NEAR-CERTAIN BET — ${timeStr} left**`;

  const llmLine = data.llmScore
    ? `\n🤖 AI score: ${data.llmScore}/10 — _${data.llmReasoning ?? ''}_`
    : '';

  return [
    urgentHeader,
    ``,
    `"${data.question}"`,
    `→ **${data.outcome}** at ${probPct}% probability`,
    ``,
    winnings,
    `Volume: ${volStr} | Source: ${sourceLabel}${llmLine}`,
    `🔗 ${data.url}`,
    ``,
    `🕐 ${new Date(signal.created_at).toUTCString()}`,
  ].join('\n');
}

function formatBetResult(signal: TradingSignal): string {
  let data: BetResultData | null = null;
  try { data = JSON.parse(signal.reason) as BetResultData; } catch { return signal.reason; }
  if (!data) return signal.reason;

  const profitStr = data.profit >= 0 ? `+$${data.profit.toFixed(2)}` : `-$${Math.abs(data.profit).toFixed(2)}`;
  const statusLine = data.won
    ? `✅ **BET WON — ${profitStr}**`
    : `❌ **BET LOST — -$${data.stake.toFixed(2)}**`;
  const s = data.stats;
  const runningStr = s.netProfit >= 0 ? `+$${s.netProfit.toFixed(2)}` : `-$${Math.abs(s.netProfit).toFixed(2)}`;

  return [
    statusLine,
    ``,
    `"${data.question}"`,
    `Predicted: **${data.predictedOutcome}** → Actual: **${data.actualOutcome}**`,
    `Entry probability: ${Math.round(data.probability * 100)}%`,
    ``,
    `📊 3-Day Paper P&L: ${runningStr}`,
    `${s.won}W / ${s.lost}L | Win rate: ${s.winRate}%`,
    `Total bets: ${s.totalBets}`,
  ].join('\n');
}

function formatStopLoss(signal: TradingSignal): string {
  let data: StopLossData | null = null;
  try { data = JSON.parse(signal.reason) as StopLossData; } catch { return signal.reason; }
  if (!data) return signal.reason;
  return [
    `🛑 **STOP-LOSS TRIGGERED**`,
    ``,
    `"${data.question}"`,
    `Predicted: **${data.predictedOutcome}**`,
    `Entry: ${Math.round(data.entryProbability * 100)}% → Now: ${Math.round(data.currentProbability * 100)}% (dropped ${data.drop}pp)`,
    ``,
    `$10 paper bet voided — exit before further loss`,
    `3-Day P&L so far: ${data.runningPnL}`,
  ].join('\n');
}

function formatNewsDigest(signal: TradingSignal): string {
  let data: { type: string; date: string; items: Array<{ title: string; source: string; url: string }> } | null = null;
  try { data = JSON.parse(signal.reason) as typeof data; } catch { return signal.reason; }
  if (!data) return signal.reason;

  const rows = (data.items ?? []).slice(0, 10).map((item, i) => {
    const source = item.source ? ` — ${item.source}` : '';
    const link = item.url ? `\n   🔗 ${item.url}` : '';
    return `${i + 1}. *${item.title}*${source}${link}`;
  });

  return [
    `📰 *CRYPTO MORNING DIGEST*`,
    `_${data.date}_`,
    ``,
    ...rows,
  ].join('\n');
}

function formatMessage(signal: TradingSignal): string {
  if (signal.symbol === 'NEWS') {
    return formatNewsDigest(signal);
  }
  if (signal.symbol === 'MARKET' && signal.trending_data) {
    return formatTrendingMessage(signal);
  }
  if (signal.symbol === 'PRED_RESULT') {
    return formatBetResult(signal);
  }
  if (signal.symbol === 'PRED_STOPLOSS') {
    return formatStopLoss(signal);
  }
  if (signal.symbol === 'PRED') {
    return formatPredictionMessage(signal);
  }

  // Combined crypto news digest (twice daily) — one message for all coins
  if (signal.symbol === 'CRYPTO_NEWS') {
    try {
      const data = JSON.parse(signal.reason) as {
        type: string; date: string;
        coins: Record<string, Array<{ title: string; url: string | null; source: string | null }>>;
      };
      const sections = Object.entries(data.coins ?? {})
        .filter(([, items]) => items.length > 0)
        .map(([coin, items]) => {
          const rows = items.slice(0, 4).map((item, i) => {
            const src = item.source ? ` (${item.source})` : '';
            const link = item.url ? `\n   🔗 ${item.url}` : '';
            return `${i + 1}. ${item.title}${src}${link}`;
          });
          return [`📊 **${coin}/USD**`, ...rows].join('\n');
        });
      return [
        `📰 **CRYPTO NEWS — ${data.date}**`,
        ``,
        ...sections.join('\n\n').split('\n'),
        ``,
        `🕐 ${new Date(signal.created_at).toUTCString()}`,
      ].join('\n');
    } catch { return ''; }
  }

  // Individual NewsBot signals (price-monitor) — skip in Telegram, only used by AnalystBot
  if (signal.agent_id === 'price-monitor') return '';

  // AnalystBot / ContentBot — full signal with price
  const confidencePct = Math.round((signal.confidence || 0) * 100);
  const pair = `${signal.symbol || 'SOL'}/USD`;
  const priceLines: string[] = [];
  if (signal.actual_price > 0) priceLines.push(`💰 Price: $${signal.actual_price.toFixed(2)}`);
  if (signal.target_price > 0 && signal.target_price !== signal.actual_price) {
    priceLines.push(`📍 Target: $${signal.target_price.toFixed(2)}`);
  }
  const accuracy = getAccuracyLine(_db);
  return [
    `🎯 **${pair} — ${signal.action}**`,
    ...priceLines,
    `📊 Confidence: ${confidencePct}%`,
    `💡 ${signal.reason}`,
    `⚠️ Risk: ${signal.risk_level}${accuracy}`,
    ``,
    `🕐 ${new Date(signal.created_at).toUTCString()}`,
  ].join('\n');
}

interface StopLossData {
  type: 'stop_loss'; question: string; predictedOutcome: string;
  entryProbability: number; currentProbability: number; drop: number;
  stake: number; marketUrl: string; runningPnL: string;
}

interface BetResultData {
  type: 'paper_bet_result';
  won: boolean;
  question: string;
  predictedOutcome: string;
  actualOutcome: string;
  stake: number;
  payout: number;
  profit: number;
  probability: number;
  marketUrl: string;
  stats: { totalBets: number; won: number; lost: number; winRate: number; netProfit: number; profitStr: string };
}

interface PredMarketData {
  marketId: string;
  question: string;
  outcome: string;
  probability: number;
  hoursLeft: number;
  volume: number;
  url: string;
  source: string;
  urgent: boolean;
  llmScore?: number;
  llmReasoning?: string;
}

async function sendSignal(signal: TradingSignal): Promise<string | null> {
  if (process.env.DRY_RUN === 'true') {
    console.log(`[Telegram] DRY RUN — would send:\n${formatMessage(signal)}`);
    return `dry-run-${Date.now()}`;
  }

  const tg = getBot();
  const channelId = getChannelId();
  const text = formatMessage(signal);

  try {
    const result = await tg.telegram.sendMessage(channelId, text, {
      parse_mode: 'Markdown',
    });
    const messageId = String(result.message_id);
    console.log(`[Telegram] Sent signal ${signal.id} → message ${messageId}`);
    return messageId;
  } catch (err: any) {
    // Rate limit / flood wait
    if (err?.response?.error_code === 429) {
      const retryAfter = err?.response?.parameters?.retry_after || 60;
      console.warn(`[Telegram] Rate limited. Waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      throw new Error(`Rate limited, retry after ${retryAfter}s`);
    }

    // If markdown parse fails, retry without markdown
    if (err?.response?.error_code === 400 && err?.response?.description?.includes('parse')) {
      console.warn(`[Telegram] Markdown parse failed for ${signal.id}, retrying plain text`);
      const plainText = formatMessage(signal).replace(/[*_`[\]()~>#+=|{}.!\\-]/g, '');
      const result = await tg.telegram.sendMessage(channelId, plainText);
      return String(result.message_id);
    }

    throw err;
  }
}

async function processBatch(): Promise<void> {
  const signals = getUnpostedSignals('telegram');

  if (signals.length === 0) {
    return;
  }

  console.log(`[Telegram] Found ${signals.length} unposted signal(s)`);

  for (const signal of signals) {
    try {
      // Skip prediction market signals with 99-100% probability — not useful
      if (signal.symbol === 'PRED') {
        try {
          const data = JSON.parse(signal.reason) as { probability?: number };
          if (data.probability != null && data.probability > 0.98) {
            markSignalPosted(signal.id, 'telegram', 'skipped-100pct');
            continue;
          }
        } catch { /* ignore parse errors */ }
      }
      // Skip signals where formatter returns empty (e.g. news with no headlines)
      const formatted = formatMessage(signal);
      if (!formatted.trim()) {
        markSignalPosted(signal.id, 'telegram', 'skipped-empty');
        continue;
      }
      const messageId = await sendSignal(signal);
      if (messageId) {
        markSignalPosted(signal.id, 'telegram', messageId);
        messagesCount++;
        lastMessageTime = Date.now();
        retryDelay = 5000; // Reset backoff on success
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[Telegram] Failed to send signal ${signal.id}:`, errorMsg);
      markSignalError(signal.id, errorMsg);

      // Exponential backoff
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
      console.log(`[Telegram] Backing off for ${retryDelay}ms`);
      await sleep(retryDelay);
    }
  }
}

export async function startTelegramBot(): Promise<void> {
  if (running) {
    console.warn('[Telegram] Bot already running');
    return;
  }

  running = true;
  console.log('[Telegram] Bot started');

  while (running) {
    try {
      await processBatch();
    } catch (err: any) {
      console.error('[Telegram] Unexpected error in poll loop:', err?.message || err);
    }

    if (running) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log('[Telegram] Bot stopped');
}

export function stopTelegramBot(): void {
  running = false;
}

export async function getTelegramMetrics(): Promise<TelegramMetrics> {
  const counts = getSignalCount();
  let memberCount = 0;

  const tg = getBot();
  const channelId = getChannelId();
  try {
    const chat = await tg.telegram.getChat(channelId);
    if ('member_count' in chat && typeof chat.member_count === 'number') {
      memberCount = chat.member_count;
    }
  } catch (err: any) {
    console.warn('[Telegram] Could not fetch member count:', err?.message);
  }

  return {
    messagesCount: counts.telegram,
    memberCount,
    lastMessageTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
