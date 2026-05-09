/**
 * Hook 6 — Execution Timeout
 *
 * Intercepts: WRAPS tool execution.
 * Prevents infinite loops where Poly keeps calling tools indefinitely,
 * draining both OpenRouter credits and the user's patience.
 *
 * Hard limits:
 *   - Single tool call: 30 seconds
 *   - Total tool chain per message: 5 tool calls max
 *   - Total elapsed time per message: 60 seconds
 *
 * Usage: wrap any async tool call with withTimeout().
 */

import { GuardrailContext, GuardrailResult } from './types.js';

const SINGLE_TOOL_TIMEOUT_MS = 30_000;
const MAX_TOOL_CALLS_PER_MESSAGE = 5;
const MAX_TOTAL_ELAPSED_MS = 60_000;

/** Per-message execution state, keyed by chatId:messageTimestamp */
interface ExecutionState {
  toolCallCount: number;
  startedAt: number;
}

const execStates = new Map<string, ExecutionState>();

function stateKey(ctx: GuardrailContext): string {
  return `${ctx.chatId}:${ctx.timestamp}`;
}

/**
 * Call before each tool execution attempt.
 * Returns 'block' when the chain has exceeded limits.
 */
export async function executionTimeoutHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  if (!ctx.toolCall) {
    return {
      decision: 'allow',
      audit: { hook: 'execution-timeout', decision: 'allow', reason: 'no_tool_call' },
    };
  }

  const key = stateKey(ctx);
  const now = Date.now();

  if (!execStates.has(key)) {
    execStates.set(key, { toolCallCount: 0, startedAt: now });
  }

  const state = execStates.get(key)!;
  state.toolCallCount++;

  // 1. Tool call count limit
  if (state.toolCallCount > MAX_TOOL_CALLS_PER_MESSAGE) {
    execStates.delete(key);
    return {
      decision: 'block',
      userMessage: "I've run a lot of lookups for this request — I'll stop here to keep things snappy. Try breaking it into smaller questions.",
      audit: {
        hook: 'execution-timeout',
        decision: 'block',
        reason: 'tool_call_count_exceeded',
        meta: { toolCallCount: state.toolCallCount, max: MAX_TOOL_CALLS_PER_MESSAGE },
      },
    };
  }

  // 2. Total elapsed time
  const elapsed = now - state.startedAt;
  if (elapsed > MAX_TOTAL_ELAPSED_MS) {
    execStates.delete(key);
    return {
      decision: 'block',
      userMessage: "This is taking longer than expected. I'll stop here — try a simpler question.",
      audit: {
        hook: 'execution-timeout',
        decision: 'block',
        reason: 'total_elapsed_exceeded',
        meta: { elapsedMs: elapsed, maxMs: MAX_TOTAL_ELAPSED_MS },
      },
    };
  }

  return {
    decision: 'allow',
    audit: {
      hook: 'execution-timeout',
      decision: 'allow',
      reason: 'within_limits',
      meta: { toolCallCount: state.toolCallCount, elapsedMs: elapsed },
    },
  };
}

/**
 * Wraps a promise with a hard single-tool timeout.
 * Throws if the tool takes longer than SINGLE_TOOL_TIMEOUT_MS.
 */
export function withTimeout<T>(promise: Promise<T>, toolName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool '${toolName}' timed out after ${SINGLE_TOOL_TIMEOUT_MS}ms`));
    }, SINGLE_TOOL_TIMEOUT_MS);

    promise
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/** Call after a message is fully processed to clean up state. */
export function clearExecutionState(ctx: GuardrailContext): void {
  execStates.delete(stateKey(ctx));
}
