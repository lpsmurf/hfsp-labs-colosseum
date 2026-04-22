// [GEMINI] Approval flow and button handling
import { TelegramCallbackQuery } from "../utils/telegram-security.js";
import { createLogger } from "../utils/logger.js";
import {
  editTelegramMessage,
  answerCallbackQuery,
} from "../services/telegram-api.js";
import type { PendingApproval } from "../types/index.js";

const logger = createLogger();

// In-memory storage for pending approvals
// Key: messageId (from Telegram), Value: PendingApproval
const pendingApprovals = new Map<number, PendingApproval>();

/**
 * Store a pending approval for later reference
 */
export function storePendingApproval(approval: PendingApproval): void {
  pendingApprovals.set(approval.messageId, approval);
  logger.debug(
    { messageId: approval.messageId, amount: approval.amount },
    "Approval stored"
  );
}

/**
 * Retrieve a pending approval by message ID
 */
export function getPendingApproval(messageId: number): PendingApproval | undefined {
  return pendingApprovals.get(messageId);
}

/**
 * Remove a pending approval
 */
export function removePendingApproval(messageId: number): void {
  pendingApprovals.delete(messageId);
  logger.debug({ messageId }, "Approval removed");
}

/**
 * Parse callback_data from button click
 * Format: "approve:messageId" or "reject:messageId"
 */
function parseCallbackData(data?: string): {
  action: "approve" | "reject" | null;
  messageId: number | null;
} {
  if (!data) {
    return { action: null, messageId: null };
  }

  const parts = data.split(":");
  if (parts.length !== 2) {
    return { action: null, messageId: null };
  }

  const action = parts[0] as "approve" | "reject";
  const messageId = parseInt(parts[1], 10);

  if (!["approve", "reject"].includes(action) || isNaN(messageId)) {
    return { action: null, messageId: null };
  }

  return { action, messageId };
}

/**
 * Handle approval or rejection button clicks
 */
export async function handleApproval(
  callbackQuery: TelegramCallbackQuery
): Promise<void> {
  try {
    // Parse the callback data
    const { action, messageId } = parseCallbackData(callbackQuery.data);

    if (!action || messageId === null) {
      logger.warn(
        { data: callbackQuery.data },
        "Invalid callback data format"
      );
      await answerCallbackQuery(
        callbackQuery.id,
        "Invalid button data"
      );
      return;
    }

    // Get pending approval
    const approval = getPendingApproval(messageId);
    if (!approval) {
      logger.warn(
        { messageId },
        "No pending approval found for message"
      );
      await answerCallbackQuery(
        callbackQuery.id,
        "This approval has expired"
      );
      return;
    }

    // Validate user is the one who requested the approval
    const userId = callbackQuery.from.id;
    if (userId !== approval.userId) {
      logger.warn(
        { userId, approvalUserId: approval.userId },
        "User attempted to approve/reject another user's request"
      );
      await answerCallbackQuery(
        callbackQuery.id,
        "This approval is not for you"
      );
      return;
    }

    // Process the action
    const statusMessage =
      action === "approve"
        ? `✅ Approved payment of $${approval.amount}`
        : `❌ Rejected payment of $${approval.amount}`;

    logger.info(
      {
        action,
        userId,
        amount: approval.amount,
        messageId,
      },
      "Approval button clicked"
    );

    // Edit the message to show the approval status
    await editTelegramMessage(
      approval.chatId,
      approval.agentMessageId,
      statusMessage
    );

    // Remove from pending approvals
    removePendingApproval(messageId);

    // Acknowledge the callback to Telegram
    await answerCallbackQuery(callbackQuery.id, statusMessage);
  } catch (error) {
    logger.error(
      { error, callbackQueryId: callbackQuery.id },
      "Error handling approval"
    );

    // Try to acknowledge the error to user
    try {
      await answerCallbackQuery(
        callbackQuery.id,
        "An error occurred processing your response"
      );
    } catch (ackError) {
      logger.error(
        { error: ackError },
        "Failed to acknowledge callback query"
      );
    }
  }
}
