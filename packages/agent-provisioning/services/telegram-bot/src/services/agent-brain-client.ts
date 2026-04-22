// [GEMINI] Agent-brain client for calling /message endpoint
import axios from "axios";
import { createLogger } from "../utils/logger.js";
import type { AgentBrainResponse } from "../types/index.js";

const logger = createLogger();

// Get agent-brain URL from environment or use default
const AGENT_BRAIN_URL = process.env.AGENT_BRAIN_URL || "http://agent-brain:3334";
const AGENT_BRAIN_TIMEOUT = 10000; // 10 seconds

/**
 * Call the agent-brain /message endpoint
 * @param userId - Telegram user ID (formatted as "telegram:123456")
 * @param message - User message to process
 * @returns AgentBrainResponse with response text and optional approval details
 */
export async function callAgentBrain(
  userId: string,
  message: string
): Promise<AgentBrainResponse> {
  try {
    logger.debug(
      { userId, messageLength: message.length },
      "Calling agent-brain"
    );

    const response = await axios.post<AgentBrainResponse>(
      `${AGENT_BRAIN_URL}/message`,
      {
        user_id: userId,
        message,
      },
      {
        timeout: AGENT_BRAIN_TIMEOUT,
      }
    );

    logger.debug(
      {
        userId,
        requiresApproval: response.data.requiresApproval,
        amount: response.data.approvalAmount,
      },
      "Agent-brain response received"
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED") {
        logger.error(
          { error: error.message, url: AGENT_BRAIN_URL },
          "Failed to connect to agent-brain"
        );
      } else if (error.response) {
        logger.error(
          { status: error.response.status, userId },
          "Agent-brain returned error"
        );
      } else if (error.request) {
        logger.error(
          { userId },
          "No response from agent-brain"
        );
      } else {
        logger.error(
          { error: error.message, userId },
          "Error setting up agent-brain request"
        );
      }
    } else {
      logger.error(
        { error, userId },
        "Unexpected error calling agent-brain"
      );
    }

    // Return a graceful error response
    return {
      response:
        "Sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.",
      requiresApproval: false,
    };
  }
}
