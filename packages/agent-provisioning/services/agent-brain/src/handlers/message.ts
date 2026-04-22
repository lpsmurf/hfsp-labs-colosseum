import type { PoliAgent } from "../services/mastra-agent.js";

/**
 * MessageHandler: Routes user messages through agent with spending limits
 */
export class MessageHandler {
  constructor(private agent: PoliAgent) {}

  /**
   * Handle incoming user message, return agent response
   */
  async handleMessage(userMessage: string): Promise<{
    response: string;
    requiresApproval?: boolean;
    approvalAmount?: number;
  }> {
    const manifest = this.agent.getIdentity();
    const policy = this.agent.getSkills(); // For context
    
    // TODO: Wire Claude LLM here
    // For now, return placeholder that demonstrates understanding

    return {
      response: `Hello! I'm ${manifest.name}. You said: "${userMessage}". I'm ready to help with travel booking, DAO setup, or trading signals. What would you like to do?`,
      requiresApproval: false,
    };
  }

  /**
   * Handle approval from user (Telegram button click)
   */
  async handleApproval(
    requestId: string,
    approved: boolean
  ): Promise<{
    status: string;
    result?: unknown;
  }> {
    if (approved) {
      return { status: "approved", result: "Proceeding with request..." };
    } else {
      return { status: "rejected" };
    }
  }
}
