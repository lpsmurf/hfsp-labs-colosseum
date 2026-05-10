// [OPENAI] Message handler — full guardrail pipeline
import type { TelegramMessage } from "../utils/telegram-security.js";
import { createLogger } from "../utils/logger.js";
import { sendTelegramMessage } from "../services/telegram-api.js";
import { callAgentBrain } from "../services/agent-brain-client.js";
import {
  runOnboardingGate,
  runIntakeGuardrails,
  runOutputGuardrails,
} from "../guardrails/pipeline.js";
import type { GuardrailContext } from "../guardrails/types.js";
import { claimPairCode, advanceOnboardingState } from "../services/platform-client.js";
import { storePendingApproval } from "./approval.js";

const logger = createLogger();

// ─── /start handler ───────────────────────────────────────────────────────────

async function handleStart(chatId: number, pairCode: string | undefined): Promise<void> {
  if (!pairCode) {
    await sendTelegramMessage(
      chatId,
      "👋 Welcome to *Poly*!\n\nTo get started, click the activation link from your Clawdrop dashboard at clawdrop.live/deploy.",
      undefined,
      "Markdown",
    );
    return;
  }

  const result = await claimPairCode(chatId, pairCode);

  if (!result) {
    await sendTelegramMessage(
      chatId,
      "❌ That activation link has expired or is invalid. Get a fresh one from your Clawdrop dashboard at clawdrop.live/deploy.",
      undefined,
      "Markdown",
    );
    return;
  }

  // Pairing done — run onboarding gate to send the email CTA immediately
  const ctx: GuardrailContext = {
    chatId,
    userId: result.userId,
    messageText: "/start",
    timestamp: Math.floor(Date.now() / 1000),
  };

  const onboarding = await runOnboardingGate(ctx);

  if (!onboarding.allowed && onboarding.userMessage) {
    await sendTelegramMessage(chatId, onboarding.userMessage, undefined, "Markdown");
    if (onboarding.audit[0]?.reason === "onboarding_not_started") {
      await advanceOnboardingState(chatId, "awaiting_email");
    }
  } else {
    // Shouldn't happen right after a fresh claim, but handle gracefully
    await sendTelegramMessage(
      chatId,
      "✅ Your agent is connected! What would you like to know?",
      undefined,
      "Markdown",
    );
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleMessage(message: TelegramMessage): Promise<void> {
  if (!message.text || !message.from) {
    logger.warn({ messageId: message.message_id }, "Message has no text or from field");
    return;
  }

  const chatId = message.chat.id;
  const userId = `telegram:${chatId}`;
  const messageText = message.text.trim();
  const timestamp = message.date;

  logger.info(
    {
      userId: message.from.id,
      chatId,
      username: message.from.username,
      textLength: messageText.length,
    },
    "Message received",
  );

  // ─── /start <pairCode> ───────────────────────────────────────────────────
  if (messageText.startsWith("/start")) {
    const parts = messageText.split(/\s+/);
    await handleStart(chatId, parts[1]);
    return;
  }

  const ctx: GuardrailContext = { chatId, userId, messageText, timestamp };

  // ─── 0. Onboarding gate ──────────────────────────────────────────────────
  const onboarding = await runOnboardingGate(ctx);

  if (!onboarding.allowed) {
    if (onboarding.userMessage) {
      await sendTelegramMessage(chatId, onboarding.userMessage, undefined, "Markdown");
    }
    // 'not_started' → welcome sent, advance to email-collection state
    if (onboarding.audit[0]?.reason === "onboarding_not_started") {
      await advanceOnboardingState(chatId, "awaiting_email");
    }
    return;
  }

  // ─── 1–3. Intake guardrails ──────────────────────────────────────────────
  const intake = await runIntakeGuardrails(ctx);

  if (!intake.allowed) {
    if (intake.userMessage) {
      await sendTelegramMessage(chatId, intake.userMessage, undefined, "Markdown");
    }
    return;
  }

  // ─── Call agent brain ────────────────────────────────────────────────────
  let brainResponse;
  try {
    brainResponse = await callAgentBrain(userId, messageText);
  } catch (err) {
    logger.error({ err, chatId }, "Unexpected error calling agent brain");
    await sendTelegramMessage(
      chatId,
      "Sorry, something went wrong. Please try again in a moment.",
      undefined,
      "Markdown",
    );
    return;
  }

  // Approval flow — surface confirmation buttons before executing a swap
  if (brainResponse.requiresApproval && brainResponse.approvalAmount !== undefined) {
    const text =
      `⚠️ *Confirmation required*\n\nYour agent wants to execute a transaction worth *$${brainResponse.approvalAmount.toFixed(2)}*.\n\nApprove or reject?`;

    // We need the sent message's ID to edit it after the user responds.
    // Telegram doesn't return message_id from sendTelegramMessage, so we use a
    // placeholder that will be updated if needed.
    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve:${message.message_id}` },
          { text: "❌ Reject",  callback_data: `reject:${message.message_id}` },
        ],
      ],
    };

    await sendTelegramMessage(chatId, text, keyboard, "Markdown");

    storePendingApproval({
      messageId: message.message_id,
      chatId,
      userId: message.from.id,
      amount: brainResponse.approvalAmount,
      agentMessageId: message.message_id,
      timestamp: Date.now(),
    });

    return;
  }

  // ─── 7–8. Output guardrails ──────────────────────────────────────────────
  const output = await runOutputGuardrails(ctx, brainResponse.response);

  if (!output.allowed) {
    if (output.userMessage) {
      await sendTelegramMessage(chatId, output.userMessage, undefined, "Markdown");
    }
    return;
  }

  let responseText = output.sanitizedText ?? brainResponse.response;
  if (output.notice) {
    responseText = `${responseText}\n\n${output.notice}`;
  }

  await sendTelegramMessage(chatId, responseText, undefined, "Markdown");
}
