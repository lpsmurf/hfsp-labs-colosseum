import axios from "axios";
import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";

const logger = createLogger();

function getTelegramToken(): string {
  // Try file first (production)
  const tokenFile = process.env.TELEGRAM_BOT_TOKEN_FILE;
  if (tokenFile) {
    try {
      const token = fs.readFileSync(tokenFile, "utf-8").trim();
      if (token) {
        logger.debug({ file: tokenFile }, "Loaded token from file");
        return token;
      }
    } catch (error) {
      logger.error({ error, file: tokenFile }, "Failed to read token file");
    }
  }

  // Fall back to env var (development)
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN_FILE must be set"
    );
  }

  return token;
}

const TELEGRAM_BOT_TOKEN = getTelegramToken();
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ReplyMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup
): Promise<void> {
  try {
    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });

    logger.debug({ chatId, text: text.substring(0, 50) }, "Message sent");
  } catch (error) {
    logger.error(
      { error, chatId },
      "Error sending Telegram message"
    );
    throw error;
  }
}

export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  try {
    await axios.post(`${TELEGRAM_API_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    });

    logger.debug({ chatId, messageId }, "Message edited");
  } catch (error) {
    logger.error(
      { error, chatId, messageId },
      "Error editing Telegram message"
    );
    throw error;
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    await axios.post(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });

    logger.debug({ callbackQueryId }, "Callback answered");
  } catch (error) {
    logger.error(
      { error, callbackQueryId },
      "Error answering callback query"
    );
  }
}
