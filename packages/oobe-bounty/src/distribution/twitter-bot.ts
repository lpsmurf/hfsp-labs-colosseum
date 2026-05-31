import { TwitterApi } from 'twitter-api-v2';
import {
  getUnpostedSignals,
  markSignalPosted,
  markSignalError,
  getSignalCount,
} from './db.js';
import type { TradingSignal, TwitterMetrics } from './types.js';

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
const TELEGRAM_HANDLE = process.env.TELEGRAM_CHANNEL_HANDLE ?? '@ClawdropSignals';
const CTA = `Get live signals before they happen → ${TELEGRAM_HANDLE}`;

let running = false;
let postsCount = 0;
let lastPostTime = 0;
let retryDelay = 5000;
let twitterClient: TwitterApi | null = null;
let bearerClient: TwitterApi | null = null;

function getClient(): TwitterApi {
  if (!twitterClient) {
    const appKey = process.env.TWITTER_API_KEY;
    const appSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      throw new Error(
        'Twitter credentials missing. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET'
      );
    }

    twitterClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
  }
  return twitterClient;
}

function getBearerClient(): TwitterApi | null {
  if (!bearerClient) {
    const bearer = process.env.TWITTER_BEARER_TOKEN;
    if (bearer) {
      bearerClient = new TwitterApi(bearer);
    }
  }
  return bearerClient;
}

function formatTweet(signal: TradingSignal): string {
  // Daily news digest
  if (signal.symbol === 'NEWS') {
    let data: { date: string; items: Array<{ title: string; source: string }> } | null = null;
    try { data = JSON.parse(signal.reason) as typeof data; } catch { return signal.reason.slice(0, 280); }
    if (!data) return signal.reason.slice(0, 280);
    const rows = (data.items ?? []).slice(0, 4).map((item, i) =>
      `${i + 1}. ${item.title.slice(0, 55)}`
    );
    return [`📰 CRYPTO MORNING DIGEST`, ``, ...rows, ``, CTA].join('\n').slice(0, 280);
  }

  // Trending digest
  if (signal.symbol === 'MARKET' && signal.trending_data) {
    let tokens: Array<{ rank: number; symbol: string; change24h: number }> = [];
    try { tokens = JSON.parse(signal.trending_data) as typeof tokens; } catch { /* empty */ }
    // Twitter limit: 280 chars. Keep rows short — no insights (save for Telegram)
    const rows = tokens.slice(0, 5).map(t => {
      const dir = t.change24h >= 0 ? '+' : '';
      const emoji = t.change24h >= 5 ? '🚀' : t.change24h >= 0 ? '🟢' : '🔴';
      return `${t.rank}. ${emoji} ${t.symbol} ${dir}${t.change24h.toFixed(1)}%`;
    });
    const tweet = [`🔥 TOP TRENDING CRYPTO RIGHT NOW`, ``, ...rows, ``, CTA].join('\n');
    return tweet.slice(0, 280);
  }

  // Stop-loss alert
  if (signal.symbol === 'PRED_STOPLOSS') {
    let data: StopLossData | null = null;
    try { data = JSON.parse(signal.reason) as StopLossData; } catch { return signal.reason.slice(0, 280); }
    if (!data) return signal.reason.slice(0, 280);
    return [
      `🛑 Stop-loss triggered`,
      ``,
      `"${data.question.slice(0, 80)}"`,
      `${data.predictedOutcome}: ${Math.round(data.entryProbability*100)}% → ${Math.round(data.currentProbability*100)}% (−${data.drop}pp)`,
      `Paper bet voided | P&L: ${data.runningPnL}`,
    ].join('\n');
  }

  // Winning bet result only (losers filtered out by isTwitterWorthy)
  if (signal.symbol === 'PRED_RESULT') {
    let data: BetResultData | null = null;
    try { data = JSON.parse(signal.reason) as BetResultData; } catch { return signal.reason.slice(0, 280); }
    if (!data) return signal.reason.slice(0, 280);
    const profitStr = `+$${data.profit.toFixed(2)}`;
    const s = data.stats;
    const runningStr = s.netProfit >= 0 ? `+$${s.netProfit.toFixed(2)}` : `-$${Math.abs(s.netProfit).toFixed(2)}`;
    return [
      `✅ Prediction bet WON ${profitStr}`,
      ``,
      `"${data.question.slice(0, 80)}"`,
      `${data.actualOutcome} — called at ${Math.round(data.probability * 100)}%`,
      `3-day P&L: ${runningStr} | ${s.winRate}% win rate`,
      ``,
      CTA,
    ].join('\n');
  }

  // Prediction market signal
  if (signal.symbol === 'PRED') {
    let data: PredMarketData | null = null;
    try { data = JSON.parse(signal.reason) as PredMarketData; } catch { /* empty */ }
    if (!data) return signal.reason.slice(0, 280);

    const probPct = Math.round(data.probability * 100);
    const volStr = data.volume >= 1_000_000
      ? `$${(data.volume / 1_000_000).toFixed(1)}M`
      : `$${(data.volume / 1000).toFixed(0)}K`;

    const total = Math.round(100 / data.probability);
    const profit = total - 100;
    const winStr = `Bet $100 → get back $${total} (+$${profit})`;

    if (data.urgent) {
      return [
        `🚨 CLOSING IN ${data.hoursLeft}h`,
        ``,
        `"${data.question}"`,
        `→ ${data.outcome} at ${probPct}% probability`,
        `${winStr}`,
        `Vol ${volStr} | ${data.url}`,
      ].join('\n');
    }

    return [
      `🎰 Near-certain bet — ${data.hoursLeft}h left`,
      ``,
      `"${data.question}"`,
      `→ ${data.outcome} at ${probPct}% probability`,
      `${winStr}`,
      `Vol ${volStr} | ${data.url}`,
    ].join('\n');
  }

  // Confirmed correct crypto call
  const confidencePct = Math.round((signal.confidence || 0) * 100);
  const pair = `${signal.symbol || 'SOL'}/USD`;
  const currentPrice = signal.actual_price > 0 ? ` (now $${signal.actual_price.toFixed(2)})` : '';
  return [
    `✅ ${pair} — ${signal.action} call was correct`,
    `Entry: $${signal.target_price.toFixed(2)}${currentPrice}`,
    `Confidence: ${confidencePct}%`,
    `Reason: ${signal.reason}`,
    ``,
    CTA,
  ].join('\n');
}

interface StopLossData {
  type: 'stop_loss'; question: string; predictedOutcome: string;
  entryProbability: number; currentProbability: number; drop: number;
  stake: number; marketUrl: string; runningPnL: string;
}

interface BetResultData {
  type: 'paper_bet_result'; won: boolean; question: string;
  predictedOutcome: string; actualOutcome: string; stake: number;
  payout: number; profit: number; probability: number; marketUrl: string;
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

async function postSignal(signal: TradingSignal): Promise<string | null> {
  if (process.env.DRY_RUN === 'true') {
    console.log(`[Twitter] DRY RUN — would tweet:\n${formatTweet(signal)}`);
    return `dry-run-${Date.now()}`;
  }

  const client = getClient();
  const tweetText = formatTweet(signal);

  try {
    const tweet = await client.v2.tweet(tweetText);
    const tweetId = tweet.data.id;
    console.log(`[Twitter] Posted signal ${signal.id} → tweet ${tweetId}`);
    return tweetId;
  } catch (err: any) {
    // Rate limit handling
    if (err.code === 429 || err?.response?.status === 429) {
      const resetHeader = err?.response?.headers?.['x-rate-limit-reset'];
      const waitSeconds = resetHeader
        ? Math.max(0, parseInt(resetHeader, 10) - Math.floor(Date.now() / 1000))
        : 60;
      console.warn(`[Twitter] Rate limited. Waiting ${waitSeconds}s...`);
      await sleep(waitSeconds * 1000);
      throw new Error(`Rate limited, retry after ${waitSeconds}s`);
    }

    // Duplicate content
    if (err.code === 187 || err?.data?.detail?.includes('duplicate')) {
      console.warn(`[Twitter] Duplicate content for ${signal.id}, marking as posted`);
      return 'duplicate';
    }

    throw err;
  }
}

// Twitter only shows winners — drives followers to Telegram for the full feed
function isTwitterWorthy(signal: TradingSignal): boolean {
  // Always post: trending digests
  if (signal.symbol === 'MARKET') return true;

  // Daily news digest (NEWS agent)
  if (signal.symbol === 'NEWS') return true;

  // Prediction market: only winning resolved bets
  if (signal.symbol === 'PRED_RESULT') {
    try { return (JSON.parse(signal.reason) as { won?: boolean }).won === true; }
    catch { return false; }
  }

  // Never post: bet placements, stop-losses, unresolved NewsBot headlines
  if (
    signal.symbol === 'PRED' ||
    signal.symbol === 'PRED_STOPLOSS' ||
    signal.agentId === 'price-monitor'   // NewsBot — headlines only, no price, skip Twitter
  ) return false;

  // Crypto analyst signals: only post confirmed correct calls
  if (signal.agentId === 'portfolio-analyzer') {
    return signal.outcome_correct === true;
  }

  return false;
}

async function processBatch(): Promise<void> {
  const all = getUnpostedSignals('twitter');
  if (all.length === 0) return;

  // Separate worthy from unworthy — mark unworthy as posted without tweeting
  const worthy   = all.filter(isTwitterWorthy);
  const unworthy = all.filter(s => !isTwitterWorthy(s));

  // Mark unworthy signals as "posted" so they leave the queue
  for (const s of unworthy) {
    // Only skip signals that are resolved (outcome known or not applicable)
    const isResolved = s.outcome_correct !== null ||
      ['MARKET', 'PRED', 'PRED_STOPLOSS', 'PRED_RESULT'].includes(s.symbol ?? '');
    if (isResolved) {
      markSignalPosted(s.id, 'twitter', 'skipped-not-worthy');
    }
    // Unresolved crypto signals stay in queue — will be posted when outcome comes in
  }

  if (worthy.length === 0) return;
  console.log(`[Twitter] ${worthy.length} worthy signal(s) to post`);

  for (const signal of worthy) {
    try {
      const tweetId = await postSignal(signal);
      if (tweetId) {
        markSignalPosted(signal.id, 'twitter', tweetId);
        postsCount++;
        lastPostTime = Date.now();
        retryDelay = 5000;
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[Twitter] Failed to post signal ${signal.id}:`, errorMsg);
      markSignalError(signal.id, errorMsg);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
      await sleep(retryDelay);
    }
  }
}

export async function startTwitterBot(): Promise<void> {
  if (running) {
    console.warn('[Twitter] Bot already running');
    return;
  }

  running = true;
  console.log('[Twitter] Bot started');

  while (running) {
    try {
      await processBatch();
    } catch (err: any) {
      console.error('[Twitter] Unexpected error in poll loop:', err?.message || err);
    }

    if (running) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log('[Twitter] Bot stopped');
}

export function stopTwitterBot(): void {
  running = false;
}

export async function getTwitterMetrics(): Promise<TwitterMetrics> {
  const counts = getSignalCount();
  let followers = 0;

  const bearer = getBearerClient();
  if (bearer) {
    try {
      const handle = process.env.TWITTER_HANDLE || 'ClawdropSignals';
      const user = await bearer.v2.userByUsername(handle, { 'user.fields': ['public_metrics'] });
      if (user?.data?.public_metrics) {
        followers = user.data.public_metrics.followers_count || 0;
      }
    } catch (err: any) {
      console.warn('[Twitter] Could not fetch follower count:', err?.message);
    }
  }

  return {
    postsCount: counts.twitter,
    followers,
    lastPostTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
