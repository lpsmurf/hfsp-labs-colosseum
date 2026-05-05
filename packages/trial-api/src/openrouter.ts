import { createOpenAI } from '@ai-sdk/openai';
import { env } from './env.js';

const openrouterClient = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: env.OPENROUTER_API_KEY,
});

export function openrouter(modelId: string) {
  return openrouterClient(modelId);
}
