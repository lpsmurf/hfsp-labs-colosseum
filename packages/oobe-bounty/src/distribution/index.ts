import { startTwitterBot, stopTwitterBot, getTwitterMetrics } from './twitter-bot.js';
import { startTelegramBot, stopTelegramBot, getTelegramMetrics } from './telegram-bot.js';
import type { DistributionStatus } from './types.js';

let twitterRunning = false;
let telegramRunning = false;
let lastSignalPolled = 0;
let startTime = 0;

export async function startDistributionService(): Promise<void> {
  console.log('[Distribution] Starting distribution service...');
  startTime = Date.now();

  // Start Twitter bot in background (fire-and-forget with error isolation)
  twitterRunning = true;
  (async () => {
    try {
      await startTwitterBot();
    } catch (err: any) {
      console.error('[Distribution] Twitter bot crashed:', err?.message || err);
      twitterRunning = false;
    }
  })();

  // Start Telegram bot in background
  telegramRunning = true;
  (async () => {
    try {
      await startTelegramBot();
    } catch (err: any) {
      console.error('[Distribution] Telegram bot crashed:', err?.message || err);
      telegramRunning = false;
    }
  })();

  // Update poll timestamp periodically
  setInterval(() => {
    lastSignalPolled = Date.now();
  }, 2 * 60 * 1000);

  console.log('[Distribution] Both bots started');
}

export async function getDistributionStatus(): Promise<DistributionStatus> {
  const twitter = await getTwitterMetrics();
  const telegram = await getTelegramMetrics();
  const nextPoll = lastSignalPolled + 2 * 60 * 1000;

  return {
    twitter: {
      running: twitterRunning,
      posts: twitter.postsCount,
      followers: twitter.followers,
    },
    telegram: {
      running: telegramRunning,
      messages: telegram.messagesCount,
      members: telegram.memberCount,
    },
    lastSignalPolled: Math.floor(lastSignalPolled / 1000),
    nextPollTime: Math.floor(nextPoll / 1000),
  };
}

export function stopDistributionService(): void {
  console.log('[Distribution] Stopping distribution service...');
  twitterRunning = false;
  telegramRunning = false;
  stopTwitterBot();
  stopTelegramBot();
}

// Express middleware / route handler for /api/distribution/status
export function distributionStatusHandler(
  _req: any,
  res: any,
  _next?: any
): void {
  getDistributionStatus()
    .then((status) => {
      res.json(status);
    })
    .catch((err: any) => {
      console.error('[Distribution] Status error:', err?.message);
      res.status(500).json({ error: 'Failed to fetch distribution status' });
    });
}
