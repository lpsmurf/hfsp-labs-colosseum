// [OPENAI] Approval flow and button handling
import { type TelegramCallbackQuery } from "../utils/telegram-security.js";
import { createLogger } from "../utils/logger.js";
import { answerCallbackQuery, editTelegramMessage } from "../services/telegram-api.js";

const logger = createLogger();

/**
 * Handle approval/rejection button clicks
 * @param callbackQuery The callback query from a button click
 */
export async function handleApproval(
  callbackQuery: TelegramCallbackQuery
): Promise<void> {
  try {
    if (!callbackQuery.data) {
      logger.warn(
        { callbackQueryId: callbackQuery.id },
        "Callback query has no data"
      );
      await answerCallbackQuery(callbackQuery.id, "Invalid action");
      return;
    }

    const userId = callbackQuery.from.id;
    const chatId = callbackQuery.message?.chat.id;
    const messageId = callbackQuery.message?.message_id;

    if (!chatId || !messageId) {
      logger.warn(
        { callbackQueryId: callbackQuery.id, userId },
        "Missing chat or message ID"
      );
      await answerCallbackQuery(callbackQuery.id, "Invalid message");
      return;
    }

    logger.info(
      {
        userId,
        chatId,
        messageId,
        action: callbackQuery.data,
        callbackQueryId: callbackQuery.id,
      },
      "Approval button clicked"
    );

    // Parse the callback data (format: "approve:amount" or "reject:amount")
    const [action, ...rest] = callbackQuery.data.split(":");
    const amount = rest.join(":"); // In case amount contains colons

    if (action !== "approve" && action !== "reject") {
      logger.warn(
        { userId, chatId, action },
        "Unknown approval action"
      );
      await answerCallbackQuery(callbackQuery.id, "Unknown action");
      return;
    }

    logger.debug(
      {
        userId,
        action,
        amount,
      },
      "Processing approval decision"
    );

    // Acknowledge the button click
    const actionText = action === "approve" ? "Approved" : "Rejected";
    await answerCallbackQuery(
      callbackQuery.id,
      `${actionText}${amount ? ` - $${amount}` : ""}`
    );

    // Update the message to show the decision
    const updatedText =
      callbackQuery.message?.text || "";
    const decisionMessage = `${updatedText}\n\n✅ ${actionText}`;

    await editTelegramMessage(chatId, messageId, decisionMessage);

    logger.info(
      { userId, chatId, action, amount },
      "Approval decision processed"
    );

  } catch (error) {
    logger.error(
      { error, callbackQueryId: callbackQuery.id },
      "Error handling approval"
    );
    try {
      await answerCallbackQuery(
        callbackQuery.id,
        "Error processing your request"
      );
    } catch (answerError) {
      logger.error(
        { error: answerError },
        "Failed to answer callback query"
      );
    }
  }
}
