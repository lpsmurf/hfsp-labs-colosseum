/**
 * Poly Guardrails — Shared Types
 * Every hook receives a GuardrailContext and returns a GuardrailResult.
 */

export type HookDecision = 'allow' | 'block' | 'confirm_required' | 'sanitized';

export interface GuardrailContext {
  chatId: number;
  userId: string;           // "telegram:{chatId}" format
  messageText: string;
  timestamp: number;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  agentResponse?: string;
}

export interface GuardrailResult {
  decision: HookDecision;
  /**
   * Populated when decision === 'block' or 'confirm_required'.
   * Sent directly back to the user in Telegram.
   */
  userMessage?: string;
  /**
   * Populated when decision === 'sanitized'.
   * The cleaned text to use instead of the original.
   */
  sanitizedText?: string;
  /**
   * Structured audit log data — written to every decision regardless of allow/block.
   */
  audit: {
    hook: string;
    decision: HookDecision;
    reason: string;
    meta?: Record<string, unknown>;
  };
}

export type GuardrailHook = (ctx: GuardrailContext) => Promise<GuardrailResult>;
