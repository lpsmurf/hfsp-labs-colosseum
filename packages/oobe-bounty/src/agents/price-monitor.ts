import { startAgentLoop, runAgentOnce } from './base.js';
import { generatePriceMonitorSignal } from '../services/signal-engine.js';
import type { AgentRuntimeContext, TradingSignal } from '../types.js';

export function startPriceMonitorAgent(context: AgentRuntimeContext) {
  return startAgentLoop({
    agentId: 'price-monitor',
    service: 'search',
    generateSignal: generatePriceMonitorSignal,
    ...context,
  });
}

export async function runPriceMonitorOnce(context: AgentRuntimeContext): Promise<TradingSignal> {
  return runAgentOnce({
    agentId: 'price-monitor',
    service: 'search',
    generateSignal: generatePriceMonitorSignal,
    ...context,
  });
}
