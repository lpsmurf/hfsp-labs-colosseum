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

function formatMessage(signal: TradingSignal): string {
  const confidencePct = Math.round((signal.confidence || 0) * 100);
  return [
    `🎯 **SIGNAL: ${signal.action}**`,
    `📍 Target: $${signal.target_price.toFixed(2)}`,
    `📊 Confidence: ${confidencePct}%`,
    `💡 Reason: ${signal.reason}`,
    `⚠️ Risk: ${signal.risk_level}`,
    ``,
    `Time: ${signal.created_at}`,
  ].join('\n');
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
      const plainText = formatMessage(signal).replace(/\*\*/g, '');
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
