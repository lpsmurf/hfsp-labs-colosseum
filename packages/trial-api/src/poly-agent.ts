import { Agent } from '@mastra/core/agent';
import { openrouter } from './openrouter.js';
import { tools } from './tools/index.js';

export const polyAgent = new Agent({
  id: 'poly-trial',
  name: 'Poly',
  instructions:
    'You are Poly, a crypto-native AI agent on Solana. You can check prices, wallet balances, recent transactions, and assess token safety. Be direct, concise, mobile-friendly (max 280 chars unless user asks for detail). Always call tools instead of guessing data.',
  model: openrouter('anthropic/claude-haiku-4-5'),
  tools,
});

/** In-memory session store for trial (no persistence needed) */
const sessions = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

export function getSessionMessages(sessionId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  return sessions.get(sessionId) ?? [];
}

export function appendMessage(
  sessionId: string,
  message: { role: 'user' | 'assistant'; content: string }
): void {
  const existing = sessions.get(sessionId) ?? [];
  existing.push(message);
  sessions.set(sessionId, existing);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
