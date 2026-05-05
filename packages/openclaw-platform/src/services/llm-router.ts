/**
 * LLM Router — Route LLM calls for user agents
 *
 * Providers:
 * - poly:   Use Openclaw's OpenRouter key, track tokens
 * - byok:   Decrypt user's API key, route to their chosen provider
 * - custom: Route to user's self-hosted endpoint
 */

import { db } from '../db/index.js';
import { decrypt } from './key-vault.js';

export type LLMProvider = 'poly' | 'byok' | 'custom';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface UserLLMConfig {
  provider: LLMProvider;
  model?: string;
  providerName?: string;       // for byok: anthropic, openai, google, openrouter
  encryptedKey?: string;
  iv?: string;
  customEndpoint?: string;
}

const POLY_OPENROUTER_KEY = process.env.POLY_OPENROUTER_KEY ?? '';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function getUserLLMConfig(userId: string): UserLLMConfig {
  const row = db()
    .prepare('SELECT provider, encrypted_key, iv, custom_endpoint FROM api_keys WHERE user_id = ? LIMIT 1')
    .get(userId) as { provider?: string; encrypted_key?: string; iv?: string; custom_endpoint?: string } | undefined;

  if (!row) {
    return { provider: 'poly' };
  }

  return {
    provider: (row.provider as LLMProvider) ?? 'poly',
    encryptedKey: row.encrypted_key,
    iv: row.iv,
    customEndpoint: row.custom_endpoint,
  };
}

async function callOpenRouter(messages: Message[], model: string, apiKey: string): Promise<LLMResponse> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://clawdrop.live',
      'X-Title': 'Openclaw',
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

async function callAnthropic(messages: Message[], model: string, apiKey: string): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemMsg?.content,
      messages: chatMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  return {
    text: data.content?.[0]?.text ?? '',
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

async function callOpenAI(messages: Message[], model: string, apiKey: string): Promise<LLMResponse> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

async function callCustomEndpoint(endpoint: string, messages: Message[], apiKey?: string): Promise<LLMResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Custom endpoint error ${res.status}: ${text}`);
  }

  // Try common response formats
  const data = (await res.json()) as Record<string, unknown>;

  let text = '';
  if (typeof data.text === 'string') text = data.text;
  else if (typeof data.response === 'string') text = data.response;
  else if (Array.isArray(data.choices) && typeof data.choices[0]?.message?.content === 'string') {
    text = data.choices[0].message.content;
  } else if (Array.isArray(data.content) && typeof data.content[0]?.text === 'string') {
    text = data.content[0].text;
  }

  return { text };
}

/**
 * Route an LLM call based on user configuration
 */
export async function routeLLMCall(
  userId: string,
  agentId: string,
  messages: Message[],
): Promise<LLMResponse> {
  const config = getUserLLMConfig(userId);
  const model = config.model ?? 'anthropic/claude-haiku-4-5';

  if (config.provider === 'poly') {
    if (!POLY_OPENROUTER_KEY) {
      throw new Error('POLY_OPENROUTER_KEY not configured');
    }
    const response = await callOpenRouter(messages, model, POLY_OPENROUTER_KEY);
    await trackTokens(userId, agentId, model, response.usage);
    return response;
  }

  if (config.provider === 'byok') {
    if (!config.encryptedKey || !config.iv) {
      throw new Error('BYOK configured but no API key stored');
    }
    const apiKey = decrypt(config.encryptedKey, config.iv);

    switch (config.providerName) {
      case 'anthropic':
        return callAnthropic(messages, model, apiKey);
      case 'openai':
        return callOpenAI(messages, model, apiKey);
      case 'openrouter':
        return callOpenRouter(messages, model, apiKey);
      default:
        throw new Error(`Unknown BYOK provider: ${config.providerName}`);
    }
  }

  if (config.provider === 'custom') {
    if (!config.customEndpoint) {
      throw new Error('Custom endpoint not configured');
    }
    let apiKey: string | undefined;
    if (config.encryptedKey && config.iv) {
      apiKey = decrypt(config.encryptedKey, config.iv);
    }
    return callCustomEndpoint(config.customEndpoint, messages, apiKey);
  }

  throw new Error(`Unknown provider: ${config.provider}`);
}

/**
 * Track token usage in DB (only for poly — BYOK/custom is untracked)
 */
async function trackTokens(
  userId: string,
  agentId: string,
  model: string,
  usage?: { inputTokens: number; outputTokens: number },
): Promise<void> {
  if (!usage) return;

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  db().prepare(`
    INSERT INTO token_usage (id, user_id, agent_id, month, input_tokens, output_tokens, model)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, month) DO UPDATE SET
      input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens,
      updated_at = datetime('now')
  `).run(userId, agentId, month, usage.inputTokens, usage.outputTokens, model);
}
