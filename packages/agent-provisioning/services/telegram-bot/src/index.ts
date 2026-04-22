// [OPENAI] Express server and webhook endpoint
import express, { Request, Response } from "express";
import { createLogger } from "./utils/logger.js";
import { validateSignature } from "./utils/telegram-security.js";
import { handleWebhook } from "./handlers/webhook.js";

const logger = createLogger();

const app = express();
const port = parseInt(process.env.PORT || "3335", 10);
const secretToken = process.env.TELEGRAM_SECRET_TOKEN;

// Middleware
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
    // Validate signature if token is configured
    if (secretToken) {
      if (!validateSignature(secretToken, req as any)) {
        logger.warn("Invalid signature received");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    // Process the webhook
    await handleWebhook(req.body);

    // Always respond 200 to Telegram
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
