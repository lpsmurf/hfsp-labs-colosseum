import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createLogger } from "pino";
import { SelfManifestSchema } from "./types/manifest.js";
import { PoliAgent } from "./services/mastra-agent.js";
import { MessageHandler } from "./handlers/message.js";

dotenv.config();

const logger = createLogger();
const app = express();
const PORT = process.env.PORT || 3334;

// Middleware
app.use(cors());
app.use(express.json());

// Global agent instance
let agent: PoliAgent | null = null;
let messageHandler: MessageHandler | null = null;

/**
 * POST /initialize
 * Initialize agent with self-manifest
 *
 * Body:
 * {
 *   "identity": { "name": "Poli", ... },
 *   "wallet": { ... },
 *   "skills": [ ... ],
 *   "user_channels": [ ... ]
 * }
 */
app.post("/initialize", async (req: Request, res: Response) => {
  try {
    // Validate manifest against schema
    const manifest = SelfManifestSchema.parse(req.body);

    // Create agent
    agent = new PoliAgent(manifest);
    messageHandler = new MessageHandler(agent);

    logger.info(
      { agent: manifest.identity.name },
      "Agent initialized successfully"
    );

    res.json({
      status: "initialized",
      agent_name: manifest.identity.name,
      deployment_id: manifest.identity.deployment_id,
      system_prompt: agent.getSystemPrompt().substring(0, 100) + "...",
    });
  } catch (error) {
    logger.error({ error }, "Failed to initialize agent");
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /message
 * Send user message, get agent response
 *
 * Body:
 * {
 *   "user_id": "telegram:123456",
 *   "message": "Book me a flight to Miami"
 * }
 */
app.post("/message", async (req: Request, res: Response) => {
  if (!agent || !messageHandler) {
    return res.status(400).json({ error: "Agent not initialized" });
  }

  try {
    const { user_id, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const response = await messageHandler.handleMessage(message);

    logger.info(
      { user_id, message: message.substring(0, 50) },
      "Message processed"
    );

    res.json(response);
  } catch (error) {
    logger.error({ error }, "Failed to process message");
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /status
 * Check agent status and manifest
 */
app.get("/status", (req: Request, res: Response) => {
  if (!agent) {
    return res.status(200).json({ status: "uninitialized" });
  }

  const identity = agent.getIdentity();
  const skills = agent.getSkills();

  res.json({
    status: "ready",
    agent: {
      name: identity.name,
      deployment_id: identity.deployment_id,
      tier: identity.tier,
    },
    skills: skills.map((s) => ({ name: s.name, tools: s.tools })),
  });
});

/**
 * GET /manifest
 * Return current agent manifest (system prompt)
 */
app.get("/manifest", (req: Request, res: Response) => {
  if (!agent) {
    return res.status(400).json({ error: "Agent not initialized" });
  }

  res.json({
    identity: agent.getIdentity(),
    skills: agent.getSkills(),
    system_prompt: agent.getSystemPrompt(),
  });
});

/**
 * Health check
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT }, "Agent brain started");
  console.log(`🧠 Clawdrop Agent Brain running on port ${PORT}`);
  console.log(`   POST /initialize — boot agent with manifest`);
  console.log(`   POST /message — send user message`);
  console.log(`   GET /status — check agent status`);
  console.log(`   GET /manifest — view system prompt`);
});
