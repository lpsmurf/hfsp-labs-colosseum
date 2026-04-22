// [OPENAI] Express server and webhook endpoint
import "dotenv/config.js";
import express, { Request, Response } from "express";
import { createLogger } from "./utils/logger.js";
import { validateSignature } from "./utils/telegram-security.js";
import { handleWebhook } from "./handlers/webhook.js";

const logger = createLogger();

const app = express();
const PORT = parseInt(process.env.PORT || "3335", 10);
const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.debug(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
      },
      "Request completed"
    );
  });
  next();
});

/**
 * Health check endpoint
 */
app.get("/health", (req: Request, res: Response) => {
  logger.debug("Health check requested");
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Telegram webhook endpoint
 * POST /webhook - receives Telegram updates
 */
app.post("/webhook", async (req: Request, res: Response) => {
  try {
    logger.debug("Webhook request received");

    // Validate signature
    if (!TELEGRAM_SECRET_TOKEN) {
      logger.warn("TELEGRAM_SECRET_TOKEN not configured, skipping validation");
    } else {
      logger.debug("Validating signature");
      if (!validateSignature(TELEGRAM_SECRET_TOKEN, req)) {
        logger.warn(
          { ip: req.ip },
          "Webhook request with invalid signature"
        );
        return res.status(401).json({
          error: "Unauthorized",
        });
      }
      logger.debug("Signature valid");
    }

    // Parse and validate update
    const update = req.body;

    if (!update.update_id) {
      logger.warn({ body: req.body }, "Invalid update structure");
      return res.status(400).json({
        error: "Invalid update",
      });
    }

    logger.debug({ update_id: update.update_id }, "Webhook update received");

    // Handle the update (async, don't wait)
    handleWebhook(update).catch((error) => {
      logger.error(
        { error, update_id: update.update_id },
        "Error handling webhook"
      );
    });

    // Return 200 immediately
    res.status(200).json({
      ok: true,
    });
  } catch (error) {
    logger.error({ error }, "Webhook request error");
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  logger.warn({ method: req.method, path: req.path }, "Not found");
  res.status(404).json({
    error: "Not found",
  });
});

/**
 * Start server
 */
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "Telegram bot webhook server started");
  logger.info(
    {
      health: `http://localhost:${PORT}/health`,
      webhook: `POST http://localhost:${PORT}/webhook`,
    },
    "Available endpoints"
  );
});

// Graceful shutdown
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
