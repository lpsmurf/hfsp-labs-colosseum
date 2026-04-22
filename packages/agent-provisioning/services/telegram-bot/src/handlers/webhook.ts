import { createLogger } from "../utils/logger.js";
import {
  type TelegramUpdate,
  type TelegramMessage,
  type TelegramCallbackQuery,
} from "../utils/telegram-security.js";
import { handleMessage } from "./message.js";
import { handleApproval } from "./approval.js";

const logger = createLogger();

export async function handleWebhook(update: unknown): Promise<void> {
  const telegramUpdate = update as TelegramUpdate;

  if (!telegramUpdate.update_id) {
    logger.warn({ update }, "Invalid update structure");
    return;
  }

  logger.debug(
    { update_id: telegramUpdate.update_id },
    "Processing update"
  );

  // Handle text messages
  if (telegramUpdate.message?.text) {
    await handleMessage(telegramUpdate.message);
  }

  // Handle button clicks (approval/rejection)
  if (telegramUpdate.callback_query) {
    await handleApproval(telegramUpdate.callback_query);
  }
}
