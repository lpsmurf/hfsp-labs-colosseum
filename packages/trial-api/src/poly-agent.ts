import { Agent } from '@mastra/core/agent';
import { openrouter, DEFAULT_MODEL } from './openrouter.js';
import { tools } from './tools/index.js';

const SYSTEM_PROMPT = `You are Poly, a crypto-native AI agent on Solana. \
You can check prices, wallet balances, recent transactions, and assess token safety. \
Be direct, concise, and mobile-friendly — keep responses under 280 characters unless the user explicitly asks for more detail. \
Always call tools to get live data instead of guessing. \
Never fabricate prices, balances, or transaction data.`;

export const poly: import('@mastra/core/agent').Agent = new Agent({
  name: 'Poly',
  instructions: SYSTEM_PROMPT,
  model: openrouter(DEFAULT_MODEL),
  tools,
});
