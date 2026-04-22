// [GEMINI] TypeScript types for Telegram and agent responses
import { TelegramMessage, TelegramCallbackQuery } from "../utils/telegram-security.js";

/**
 * Response from agent-brain /message endpoint
 */
export interface AgentBrainResponse {
  response: string;
  requiresApproval?: boolean;
  approvalAmount?: number;
}

/**
 * Pending approval stored in-memory for processing button clicks
 */
export interface PendingApproval {
  messageId: number;
  chatId: number;
  userId: number;
  amount: number;
  agentMessageId: number; // For editing after approval/rejection
  timestamp: number;
}

/**
 * Handler function signatures
 */
export interface MessageHandlerContext {
  message: TelegramMessage;
  userId: string;
  chatId: number;
  text: string;
}

export interface ApprovalHandlerContext {
  callbackQuery: TelegramCallbackQuery;
  action: "approve" | "reject";
  messageId: number;
  chatId: number;
  userId: string;
}
