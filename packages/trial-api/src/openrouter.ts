import { createOpenAI } from '@ai-sdk/openai';

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required');
}

export const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    'HTTP-Referer': 'https://clawdrop.live',
    'X-Title': 'Clawdrop Trial',
  },
});

export const DEFAULT_MODEL = process.env.TRIAL_MODEL ?? 'anthropic/claude-haiku-4-5';
