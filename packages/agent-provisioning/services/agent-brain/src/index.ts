import pino from "pino";
import express from "express";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const app = express();
const PORT = process.env.PORT || 3334;

app.use(express.json());

// Health endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "agent-brain",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Message endpoint - receives messages from telegram-bot
app.post("/message", async (req, res) => {
  try {
    const { user_id, chat_id, text, message_id } = req.body;

    logger.info(
      { user_id, chat_id, message_id, text },
      "Received message from telegram-bot"
    );

    // Simulate agent response (replace with real Mastra integration later)
    const response = await handleMessage(text, user_id);

    logger.info({ user_id, response }, "Sending response to telegram-bot");

    res.json({
      status: "ok",
      user_id,
      chat_id,
      message_id,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Error processing message");
    res.status(500).json({
      status: "error",
      message: "Failed to process message",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Simple message handler (placeholder for Mastra agent)
async function handleMessage(text: string, userId: string): Promise<string> {
  // This is a placeholder - replace with real Mastra agent logic
  const responses: { [key: string]: string } = {
    hello: "Hello! I'm an AI agent. How can I help you?",
    help: "I can process messages and provide responses. Try asking me something!",
    status: "I'm operational and ready to process messages.",
    default: `I received your message: "${text}". I'm currently a placeholder agent. Real Mastra integration coming soon!`,
  };

  const lowerText = text.toLowerCase().trim();
  return (
    responses[lowerText] ||
    responses["default"]
  );
}

app.listen(PORT, () => {
  logger.info({ port: PORT }, "✅ Agent Brain listening");
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});
