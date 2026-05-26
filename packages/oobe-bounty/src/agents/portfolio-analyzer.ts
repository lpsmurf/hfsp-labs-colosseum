import { startAgentLoop, runAgentOnce } from './base.js';
import { generatePortfolioSignal } from '../services/signal-engine.js';
import type { AgentRuntimeContext, TradingSignal } from '../types.js';

export function startPortfolioAnalyzerAgent(context: AgentRuntimeContext) {
  return startAgentLoop({
    agentId: 'portfolio-analyzer',
    service: 'chat',
    generateSignal: generatePortfolioSignal,
    ...context,
  });
}

export async function runPortfolioAnalyzerOnce(context: AgentRuntimeContext): Promise<TradingSignal> {
  return runAgentOnce({
    agentId: 'portfolio-analyzer',
    service: 'chat',
    generateSignal: generatePortfolioSignal,
    ...context,
  });
}
