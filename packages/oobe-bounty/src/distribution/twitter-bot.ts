import { TwitterApi } from 'twitter-api-v2';
import {
  getUnpostedSignals,
  markSignalPosted,
  markSignalError,
  getSignalCount,
} from './db.js';
import type { TradingSignal, TwitterMetrics } from './types.js';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes cap

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
  const confidencePct = Math.round((signal.confidence || 0) * 100);
  return [
    `🎯 SIGNAL: ${signal.action}`,
    `Target: $${signal.target_price.toFixed(2)}`,
    `Confidence: ${confidencePct}%`,
    `Reason: ${signal.reason}`,
    ``,
    `Risk: ${signal.risk_level}`,
    `#Trading #Signals #AI #Solana`,
  ].join('\n');
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

async function processBatch(): Promise<void> {
  const signals = getUnpostedSignals('twitter');

  if (signals.length === 0) {
    return;
  }

  console.log(`[Twitter] Found ${signals.length} unposted signal(s)`);

  for (const signal of signals) {
    try {
      const tweetId = await postSignal(signal);
      if (tweetId) {
        markSignalPosted(signal.id, 'twitter', tweetId);
        postsCount++;
        lastPostTime = Date.now();
        retryDelay = 5000; // Reset backoff on success
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[Twitter] Failed to post signal ${signal.id}:`, errorMsg);
      markSignalError(signal.id, errorMsg);

      // Exponential backoff
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
      console.log(`[Twitter] Backing off for ${retryDelay}ms`);
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
