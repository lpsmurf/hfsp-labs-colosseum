// [OPENAI] Message parsing and extraction
import { type TelegramMessage } from "../utils/telegram-security.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger();

export interface ParsedMessage {
  userId: number;
  chatId: number;
  messageText: string;
  messageId: number;
  timestamp: number;
  username?: string;
  firstName?: string;
}

/**
 * Handle incoming Telegram message
 * Extracts user_id, chat_id, message_text and logs the message
 */
export async function handleMessage(message: TelegramMessage): Promise<void> {
  try {
    // Validate required fields
    if (!message.text) {
      logger.warn({ messageId: message.message_id }, "Message has no text");
      return;
    }

    if (!message.from) {
      logger.warn({ messageId: message.message_id }, "Message has no from field");
      return;
    }

    // Extract message data
    const parsed: ParsedMessage = {
      userId: message.from.id,
      chatId: message.chat.id,
      messageText: message.text,
      messageId: message.message_id,
      timestamp: message.date,
      username: message.from.username,
      firstName: message.from.first_name,
    };

    // Log the message
    logger.info(
      {
        userId: parsed.userId,
        chatId: parsed.chatId,
        messageId: parsed.messageId,
        username: parsed.username,
        firstName: parsed.firstName,
        textLength: parsed.messageText.length,
        timestamp: new Date(parsed.timestamp * 1000).toISOString(),
      },
      "Message received"
    );

    logger.debug(
      { parsed },
      "Parsed message data"
    );

  } catch (error) {
    logger.error(
      { error, messageId: message.message_id },
      "Error handling message"
    );
    throw error;
  }
}
