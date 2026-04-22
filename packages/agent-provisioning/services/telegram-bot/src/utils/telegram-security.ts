// [OPENAI] Telegram signature validation and types

import { createLogger } from "./logger.js";

const logger = createLogger();

// Telegram Update types
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  chat_instance: string;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/**
 * Validates Telegram webhook signature using the secret token
 * Express automatically converts header names to lowercase
 * @param secretToken The secret token configured with Telegram
 * @param request The Express request object (or object with headers and body)
 * @returns true if signature is valid, false otherwise
 */
export function validateSignature(
  secretToken: string,
  request: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }
): boolean {
  // Express converts header names to lowercase
  const token = request.headers["x-telegram-bot-api-secret-token"];

  if (!token) {
    logger.warn("Missing X-Telegram-Bot-Api-Secret-Token header");
    return false;
  }

  // Handle array case (though headers should typically be strings)
  const tokenString = Array.isArray(token) ? token[0] : token;

  if (tokenString !== secretToken) {
    logger.warn(
      { provided: tokenString?.substring(0, 8) },
      "Invalid secret token"
    );
    return false;
  }

  logger.debug("Signature validation passed");
  return true;
}
