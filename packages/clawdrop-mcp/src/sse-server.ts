import 'dotenv/config';
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createClawdropProtocolServer } from './server/mcp.js';
import { logger } from './utils/logger.js';

// Use plain Express — createMcpExpressApp has timeouts that kill SSE
const app = express();

const transports: Record<string, SSEServerTransport> = {};

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', transport: 'sse', timestamp: new Date().toISOString() });
});

// Claude connects here — keep connection open indefinitely
app.get('/sse', async (_req, res) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;

    transport.onclose = () => {
      logger.info({ sessionId }, 'SSE transport closed');
      delete transports[sessionId];
    };

    const server = createClawdropProtocolServer();
    await server.connect(transport);
    logger.info({ sessionId }, 'Established SSE MCP session');
    // Connection stays open via SSEServerTransport
  } catch (error) {
    logger.error(error, 'Failed to establish SSE stream');
    if (!res.headersSent) {
      res.status(500).send('Error establishing SSE stream');
    }
  }
});

// Claude posts JSON-RPC messages here
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).send('Missing sessionId parameter');
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).send('Session not found');
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    logger.error({ error, sessionId }, 'Error handling SSE POST message');
    if (!res.headersSent) {
      res.status(500).send('Error handling request');
    }
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Clawdrop SSE MCP server listening');
});
