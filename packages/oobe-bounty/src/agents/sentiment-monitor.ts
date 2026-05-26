import { startAgentLoop, runAgentOnce } from './base.js';
import { generateSentimentSignal } from '../services/signal-engine.js';
import type { AgentRuntimeContext, TradingSignal } from '../types.js';

export function startSentimentMonitorAgent(context: AgentRuntimeContext) {
  return startAgentLoop({
    agentId: 'sentiment-monitor',
    service: 'images',
    generateSignal: generateSentimentSignal,
    ...context,
  });
}

export async function runSentimentMonitorOnce(context: AgentRuntimeContext): Promise<TradingSignal> {
  return runAgentOnce({
    agentId: 'sentiment-monitor',
    service: 'images',
    generateSignal: generateSentimentSignal,
    ...context,
  });
}
