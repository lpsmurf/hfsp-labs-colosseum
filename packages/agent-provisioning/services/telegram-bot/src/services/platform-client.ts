/**
 * HTTP client for clawdrop-platform internal API.
 * All guardrail lookup/write functions live here so they're testable in isolation.
 */
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import type { OnboardingRecord, OnboardingState } from '../guardrails/index.js';
import type { PairingRecord } from '../guardrails/03-auth-guard.js';
import type { CreditBalance } from '../guardrails/08-credit-guard.js';

const logger = createLogger();

const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://clawdrop-platform:8788';
const INTERNAL_KEY = process.env.PLATFORM_INTERNAL_KEY ?? '';
const TIMEOUT = 5000;

function headers() {
  return INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {};
}

function base() {
  return `${PLATFORM_URL}/api/internal`;
}

// --- Onboarding ---

export async function getOnboardingRecord(chatId: number): Promise<OnboardingRecord | null> {
  try {
    const res = await axios.get(`${base()}/onboarding/by-chat/${chatId}`, { headers: headers(), timeout: TIMEOUT });
    return res.data ?? null;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    logger.error({ err, chatId }, 'platform-client: getOnboardingRecord failed');
    return null;
  }
}

export async function saveEmail(chatId: number, email: string): Promise<void> {
  await axios.post(`${base()}/onboarding/save-email`, { chatId, email }, { headers: headers(), timeout: TIMEOUT });
}

export async function advanceOnboardingState(chatId: number, state: OnboardingState): Promise<void> {
  try {
    await axios.post(`${base()}/onboarding/advance-state`, { chatId, state }, { headers: headers(), timeout: TIMEOUT });
  } catch (err) {
    logger.warn({ err, chatId, state }, 'platform-client: advanceOnboardingState failed (non-fatal)');
  }
}

// --- Pairing ---

export async function claimPairCode(chatId: number, pairCode: string): Promise<{ agentId: string; userId: string } | null> {
  try {
    const res = await axios.post(`${base()}/pairing/claim`, { chatId, pairCode }, { headers: headers(), timeout: TIMEOUT });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    logger.error({ err, chatId, pairCode }, 'platform-client: claimPairCode failed');
    return null;
  }
}

export async function getPairingRecord(chatId: number): Promise<PairingRecord | null> {
  try {
    const res = await axios.get(`${base()}/pairing/by-chat/${chatId}`, { headers: headers(), timeout: TIMEOUT });
    return res.data ?? null;
  } catch (err) {
    logger.error({ err, chatId }, 'platform-client: getPairingRecord failed');
    return null;
  }
}

// --- Credits ---

export async function getCreditBalance(userId: string): Promise<CreditBalance | null> {
  try {
    const res = await axios.get(`${base()}/credits/${encodeURIComponent(userId)}`, { headers: headers(), timeout: TIMEOUT });
    return res.data ?? null;
  } catch (err) {
    logger.error({ err, userId }, 'platform-client: getCreditBalance failed');
    return null;
  }
}
