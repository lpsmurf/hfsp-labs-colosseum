// [OPENAI] Express server and webhook endpoint
import express, { Request, Response } from "express";
import { createLogger } from "./utils/logger.js";
import { validateSignature } from "./utils/telegram-security.js";
import { handleWebhook } from "./handlers/webhook.js";
import {
  configureOnboarding,
  configurePairingLookup,
  configureCreditLookup,
} from "./guardrails/index.js";
import {
  getOnboardingRecord,
  saveEmail,
  getPairingRecord,
  getCreditBalance,
} from "./services/platform-client.js";

const logger = createLogger();

// --- Guardrail startup configuration ---
configureOnboarding(
  (chatId) => getOnboardingRecord(chatId),
  (chatId, email) => saveEmail(chatId, email),
);

configurePairingLookup((chatId) => getPairingRecord(chatId));

configureCreditLookup((userId) => getCreditBalance(userId));

logger.info("Guardrails configured");

// --- Express app ---
const app = express();
const port = parseInt(process.env.PORT || "3335", 10);
const secretToken = process.env.TELEGRAM_SECRET_TOKEN;

app.use(express.json());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  logger.debug("Health check requested");
  res.status(200).json({
    status: "healthy",
    service: "telegram-bot",
    timestamp: new Date().toISOString(),
  });
});

// Webhook endpoint for Telegram updates
app.post("/webhook", async (req: Request, res: Response) => {
  try {
    if (secretToken) {
      if (!validateSignature(secretToken, req as any)) {
        logger.warn("Invalid signature received");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    await handleWebhook(req.body);
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ error }, "Error processing webhook");
    res.status(200).json({ ok: true }); // Still return 200 to prevent retries
  }
});

// Graceful shutdown
const server = app.listen(port, () => {
  logger.info({ port }, "Telegram bot server started");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

export default app;
