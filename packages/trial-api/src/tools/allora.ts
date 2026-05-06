import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { withCache } from './_cache.js';

const ALLORA_BASE = 'https://api.allora.network/emissions/v7';

// ── Tool 1: Get Allora Topics ───────────────────────────────────────────────

const TopicsOutput = z.object({
  topics: z.array(z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
  })),
  cached: z.boolean(),
});

const KNOWN_ALLORA_TOPICS = [
  { id: 1, name: 'SOL/USD 5min', description: 'SOL price prediction 5-minute timeframe' },
  { id: 2, name: 'ETH/USD 5min', description: 'ETH price prediction 5-minute timeframe' },
  { id: 3, name: 'BTC/USD 5min', description: 'BTC price prediction 5-minute timeframe' },
  { id: 5, name: 'SOL/USD 8h',   description: 'SOL price prediction 8-hour timeframe' },
];

export const getAlloraTopics = createTool({
  id: 'get_allora_topics',
  description:
    'List available AI inference topics on Allora Network. ' +
    'Call this when the user asks about Allora topics or what predictions are available.',
  inputSchema: z.object({}),
  outputSchema: TopicsOutput,
  execute: async () => {
    return withCache('allora_topics', 3600, async () => {
      try {
        const res = await axios.get(
          `${ALLORA_BASE}/topics`,
          { timeout: 10000 }
        );

        const items: any[] = res.data?.topics ?? [];
        return {
          topics: items.map((t: any) => ({
            id: t.topic_id ?? t.id ?? 0,
            name: t.metadata ?? t.name ?? 'Unknown',
            description: t.description ?? '',
          })),
        };
      } catch {
        // Allora API sometimes returns 403; return known topics as fallback
        return { topics: KNOWN_ALLORA_TOPICS };
      }
    });
  },
});

// ── Tool 2: Get Allora Inference ────────────────────────────────────────────

const InferenceInput = z.object({
  topic_id: z.number().int().positive().describe('Allora topic ID'),
});

const InferenceOutput = z.object({
  topic_id: z.number(),
  value: z.string(),
  timestamp: z.string(),
  cached: z.boolean(),
});

export const getAlloraInference = createTool({
  id: 'get_allora_inference',
  description:
    'Get an AI price prediction from Allora Network for a specific topic. ' +
    'Call this when the user asks for an Allora prediction or forecast for a topic ID.',
  inputSchema: InferenceInput,
  outputSchema: InferenceOutput,
  execute: async ({ context }) => {
    const { topic_id } = InferenceInput.parse(context);

    return withCache(`allora_inf_${topic_id}`, 300, async () => {
      const res = await axios.get(
        `${ALLORA_BASE}/inference/${topic_id}`,
        { timeout: 10000 }
      );

      const data = res.data;
      if (!data?.inference) throw new Error('No inference data from Allora');

      return {
        topic_id,
        value: data.inference.toString(),
        timestamp: new Date().toISOString(),
      };
    });
  },
});
