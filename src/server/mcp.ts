import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequest,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, handleToolCall } from './tools';
import { logger } from '../utils/logger';

export class ClawdropMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'clawdrop-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle list_tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest) => {
      logger.info('Received list_tools request');
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle call_tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      logger.info({ tool: request.params.name }, 'Tool call requested');
      
      try {
        const result = await handleToolCall(
          request.params.name,
          request.params.arguments
        );
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage, tool: request.params.name }, 'Tool execution failed');
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Clawdrop MCP server started and connected via stdio');
  }
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ClawdropMCPServer();
  server.start().catch(error => {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  });
}
