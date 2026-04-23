/**
 * Message Handler - Placeholder for Phase 1 Testing
 * Real Mastra integration will be added in Phase 2
 */

export interface MessageRequest {
  user_id: string;
  chat_id: string;
  text: string;
  message_id: number;
}

export interface MessageResponse {
  status: string;
  response: string;
  user_id: string;
}

export async function handleMessage(
  request: MessageRequest
): Promise<MessageResponse> {
  const { user_id, chat_id, text, message_id } = request;

  // Placeholder response logic
  const response = generateResponse(text);

  return {
    status: "ok",
    response,
    user_id,
  };
}

function generateResponse(text: string): string {
  const lowerText = text.toLowerCase().trim();

  const responses: { [key: string]: string } = {
    hello: "Hello! I'm ready to help.",
    help: "I can process messages and provide responses.",
    status: "I'm operational and working correctly.",
    default: `I received: "${text}". I'm a Phase 1 test agent.`,
  };

  return responses[lowerText] || responses["default"];
}
