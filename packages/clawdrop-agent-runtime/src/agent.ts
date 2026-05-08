import 'dotenv/config';
import express, { Request, Response } from 'express';
import axios from 'axios';
import { Bot } from 'grammy';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const USER_ID = process.env.USER_ID ?? 'unknown';
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3002/mcp';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-haiku-4.5';
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1';
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3999', 10);
const APP_PORT = parseInt(process.env.APP_PORT ?? '3998', 10);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://host.docker.internal:8788';
const AGENT_ID = process.env.AGENT_ID ?? '';

// ─── Poly System Prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Poly, a crypto-native AI agent on Solana. You help users check prices, analyze wallets, swap tokens, and monitor markets through your built-in tools. Be concise, action-oriented, and never speculate about prices. When a user asks for an action you can execute (swap, balance check, price lookup), call the appropriate tool immediately rather than asking clarifying questions when the intent is clear. All swaps execute on Solana devnet during the trial period.`;

// ─── 6-Tool Whitelist ───────────────────────────────────────────────────────

const TOOL_WHITELIST = new Set([
  'get_token_price',
  'get_wallet_balance',
  'swap_tokens',
  'get_trending_tokens',
  'get_token_analytics',
  'check_token_risk',
]);

// ─── Conversation History ───────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

const chatHistories = new Map<string, ChatMessage[]>();

function getHistory(chatId: string): ChatMessage[] {
  if (!chatHistories.has(chatId)) {
    chatHistories.set(chatId, []);
  }
  return chatHistories.get(chatId)!;
}

function addMessage(chatId: string, msg: ChatMessage) {
  const history = getHistory(chatId);
  history.push(msg);
  // Keep last 20 messages to avoid context overflow
  if (history.length > 20) {
    chatHistories.set(chatId, history.slice(-20));
  }
}

// ─── MCP Client ─────────────────────────────────────────────────────────────

let mcpClient: Client | null = null;
let mcpTransport: StreamableHTTPClientTransport | null = null;
let whitelistedTools: Array<{ name: string; description?: string; inputSchema: any }> = [];

async function initMcp(): Promise<void> {
  mcpTransport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  mcpClient = new Client(
    { name: 'openclaw-agent', version: '0.1.0' },
    { capabilities: {} }
  );

  await mcpClient.connect(mcpTransport);
  console.log(`[agent] MCP connected — session ${mcpTransport.sessionId ?? 'stateless'}`);

  // Fetch tools and whitelist
  const result = await mcpClient.request(
    { method: 'tools/list', params: {} },
    ListToolsResultSchema
  );

  whitelistedTools = result.tools.filter((t) => TOOL_WHITELIST.has(t.name));
  console.log(`[agent] ${whitelistedTools.length}/${result.tools.length} tools whitelisted`);
}

async function callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (!mcpClient) throw new Error('MCP client not connected');
  const result = await mcpClient.request(
    { method: 'tools/call', params: { name, arguments: args } },
    CallToolResultSchema
  );
  // Extract text from result content
  const texts = result.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text);
  return texts.join('\n') || JSON.stringify(result.content);
}

// ─── OpenRouter Chat Completion ─────────────────────────────────────────────

interface OpenRouterMessage {
  role: string;
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

function mcpToolsToOpenRouter(tools: typeof whitelistedTools): OpenRouterTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

async function chatCompletion(
  messages: OpenRouterMessage[],
  tools: OpenRouterTool[]
): Promise<{ reply: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }> {
  const body: any = {
    model: LLM_MODEL,
    messages,
    temperature: 0.3,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await axios.post(
    `${LLM_BASE_URL}/chat/completions`,
    body,
    {
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://clawdrop.live',
        'X-Title': 'Openclaw Agent',
      },
      timeout: 60000,
    }
  );

  const choice = res.data.choices?.[0];
  const message = choice?.message;

  if (message?.tool_calls?.length) {
    const toolCalls = message.tool_calls.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));
    return { reply: message.content || '', toolCalls };
  }

  return { reply: message?.content || '' };
}

// ─── Message Handler ────────────────────────────────────────────────────────

async function handleMessage(text: string, chatId: string): Promise<string> {
  // Build message array for OpenRouter
  const history = getHistory(chatId);
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((h) => {
      if (h.role === 'tool') {
        return {
          role: 'tool',
          content: h.content,
          tool_call_id: h.tool_call_id,
        } as OpenRouterMessage;
      }
      return { role: h.role, content: h.content } as OpenRouterMessage;
    }),
    { role: 'user', content: text },
  ];

  // First completion (may trigger tool calls)
  const tools = mcpToolsToOpenRouter(whitelistedTools);
  let result = await chatCompletion(messages, tools);

  // Execute tool calls and re-query if needed
  if (result.toolCalls?.length) {
    // Add assistant message with tool_calls
    messages.push({
      role: 'assistant',
      content: result.reply,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    // Execute each tool call
    for (const tc of result.toolCalls) {
      let toolResult: string;
      try {
        toolResult = await callMcpTool(tc.name, tc.arguments);
      } catch (err) {
        toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
      });
      // Also update local history
      addMessage(chatId, { role: 'tool', content: toolResult, tool_call_id: tc.id });
    }

    // Second completion with tool results
    const finalResult = await chatCompletion(messages, []);
    result = finalResult;
  }

  // Update local history
  addMessage(chatId, { role: 'user', content: text });
  addMessage(chatId, { role: 'assistant', content: result.reply });

  return result.reply;
}

// ─── Telegram Bot ───────────────────────────────────────────────────────────

let pairedChatId: number | null = null;

async function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) return;

  const bot = new Bot(TELEGRAM_BOT_TOKEN);

  bot.command('start', async (ctx) => {
    const pairCode = ctx.match?.trim().toUpperCase();
    const chatId = ctx.chat.id;

    if (!pairCode) {
      return ctx.reply('Send /start {pair_code} to activate this agent.');
    }

    // Already paired to a different chat
    if (pairedChatId && pairedChatId !== chatId) {
      return ctx.reply('This bot is private. Contact the owner.');
    }

    // Register pairing with platform
    try {
      await axios.patch(`${PLATFORM_URL}/api/agents/${AGENT_ID}/pair`, {
        pair_code: pairCode,
        chat_id: chatId,
      });
      pairedChatId = chatId;
      await ctx.reply('✅ Poly is live. Ask me anything about Solana.');
    } catch {
      await ctx.reply('Invalid or expired pair code.');
    }
  });

  bot.on('message:text', async (ctx) => {
    if (!pairedChatId || ctx.chat.id !== pairedChatId) {
      return ctx.reply('This bot is private.');
    }
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text;
    try {
      const reply = await handleMessage(text, chatId);
      await ctx.reply(reply);
    } catch {
      await ctx.reply('Sorry, something went wrong.');
    }
  });

  bot.start();
  console.log('[agent] Telegram bot started');
}

// ─── Express Server ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    user_id: USER_ID,
    mcp_url: MCP_URL,
    mcp_connected: !!mcpClient,
    tools_available: whitelistedTools.length,
  });
});

// Message endpoint
app.post('/message', async (req: Request, res: Response) => {
  try {
    const { text, chat_id } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const chatId = String(chat_id ?? 'default');
    const reply = await handleMessage(text, chatId);
    res.json({ reply });
  } catch (err) {
    console.error('[agent] /message error:', err);
    res.status(500).json({
      error: 'Agent processing failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(APP_PORT, () => {
  console.log(`[agent] User ${USER_ID} — API on port ${APP_PORT}, health on port ${HEALTH_PORT}`);
});

// Also bind health on separate port if different
if (HEALTH_PORT !== APP_PORT) {
  const healthApp = express();
  healthApp.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      user_id: USER_ID,
      mcp_url: MCP_URL,
      mcp_connected: !!mcpClient,
      tools_available: whitelistedTools.length,
    });
  });
  healthApp.listen(HEALTH_PORT, () => {
    console.log(`[agent] Health on port ${HEALTH_PORT}`);
  });
}

// ─── Startup ────────────────────────────────────────────────────────────────

async function main() {
  try {
    await initMcp();
    await startTelegramBot();
  } catch (err) {
    console.error('[agent] MCP init failed, retrying in 10s:', (err as Error).message);
    setTimeout(main, 10000);
  }
}

main();
