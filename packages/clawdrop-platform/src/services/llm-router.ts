import axios from 'axios';
import { db } from '../db/index.js';
import { decrypt } from './key-vault.js';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
}

interface UserLLMConfig {
  provider: 'poly' | 'byok' | 'custom';
  model: string | null;
  custom_endpoint: string | null;
  encrypted_key?: string;
  iv?: string;
  provider_name?: string;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

async function trackUsage(
  userId: string,
  agentId: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const month = currentMonth();
  db().prepare(`
    INSERT INTO token_usage (id, user_id, agent_id, month, input_tokens, output_tokens, model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, month) DO UPDATE SET
      input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens,
      updated_at = datetime('now')
  `).run(uuidv4(), userId, agentId, month, inputTokens, outputTokens, model);
}

async function callOpenAICompat(
  messages: Message[],
  model: string,
  apiKey: string,
  baseUrl: string
): Promise<LLMResponse> {
  const res = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );
  const choice = res.data.choices?.[0];
  return {
    content: choice?.message?.content ?? '',
    usage: {
      input_tokens: res.data.usage?.prompt_tokens ?? 0,
      output_tokens: res.data.usage?.completion_tokens ?? 0,
    },
    model: res.data.model ?? model,
  };
}

export async function routeLLM(
  userId: string,
  agentId: string,
  messages: Message[]
): Promise<LLMResponse> {
  const agent = db()
    .prepare('SELECT llm_provider, llm_model, custom_endpoint FROM agents WHERE id = ? AND user_id = ?')
    .get(agentId, userId) as UserLLMConfig | undefined;

  if (!agent) throw new Error(`Agent ${agentId} not found for user ${userId}`);

  const config = agent;

  // ── Poly: use Openclaw's OpenRouter key ──────────────────────────────────
  if (config.provider === 'poly') {
    const polyKey = process.env.POLY_OPENROUTER_KEY;
    if (!polyKey) throw new Error('POLY_OPENROUTER_KEY not configured');
    const model = config.model ?? 'anthropic/claude-haiku-4-5';
    const response = await callOpenAICompat(messages, model, polyKey, 'https://openrouter.ai/api/v1');
    await trackUsage(userId, agentId, response.model, response.usage.input_tokens, response.usage.output_tokens);
    return response;
  }

  // ── BYOK: decrypt user's key, route to their provider ───────────────────
  if (config.provider === 'byok') {
    const keyRecord = db()
      .prepare('SELECT encrypted_key, iv, provider FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as { encrypted_key: string; iv: string; provider: string } | undefined;

    if (!keyRecord) throw new Error('No API key found for BYOK');
    const apiKey = decrypt(keyRecord.encrypted_key, keyRecord.iv);
    const model = config.model ?? 'gpt-4o';

    const BASE_URLS: Record<string, string> = {
      anthropic: 'https://api.anthropic.com/v1',
      openai: 'https://api.openai.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    };

    const baseUrl = BASE_URLS[keyRecord.provider] ?? 'https://api.openai.com/v1';
    const response = await callOpenAICompat(messages, model, apiKey, baseUrl);
    // BYOK users are not billed for tokens but we still track for their own visibility
    await trackUsage(userId, agentId, response.model, response.usage.input_tokens, response.usage.output_tokens);
    return response;
  }

  // ── Custom endpoint ────────────────────────────────────────────────────────
  if (config.provider === 'custom') {
    if (!config.custom_endpoint) throw new Error('No custom endpoint configured');

    const keyRecord = db()
      .prepare('SELECT encrypted_key, iv FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId) as { encrypted_key: string; iv: string } | undefined;

    const apiKey = keyRecord ? decrypt(keyRecord.encrypted_key, keyRecord.iv) : '';
    const model = config.model ?? 'default';
    const response = await callOpenAICompat(messages, model, apiKey, config.custom_endpoint);
    return response;
  }

  throw new Error(`Unknown LLM provider: ${config.provider}`);
}
