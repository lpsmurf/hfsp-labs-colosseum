#!/usr/bin/env node
/**
 * Mock SSE Server for Clawdrop Trial Chat
 * 
 * Serves fake SSE responses so Codex can build the frontend
 * while Kimi's real backend is being integrated.
 * 
 * Run: node scripts/mock-sse-server.js
 * Then hit: http://localhost:8788/api/chat with POST
 */

import http from 'http';
import url from 'url';

const PORT = 8788;

const MOCK_RESPONSES = [
  {
    text: 'SOL is trading at **$85.95** USD',
    toolCalls: [
      {
        name: 'get_sol_price',
        status: 'complete',
        result: { price_usd: 85.95, change_24h: 2.32 }
      }
    ]
  },
  {
    text: 'That token looks safe based on smart contract analysis and holder distribution.',
    toolCalls: [
      {
        name: 'check_token_safety',
        status: 'complete',
        result: { score: 8.5, risk: 'low', holders: 12450 }
      }
    ]
  },
  {
    text: 'Your wallet holds 5.42 SOL, worth approximately $466 USD.',
    toolCalls: [
      {
        name: 'get_wallet_balance',
        status: 'complete',
        result: { balance: 5.42, value_usd: 466 }
      }
    ]
  }
];

function sendSSEEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function randomResponse() {
  return MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/chat') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send keep-alive comment
    res.write(': connected\n\n');

    // Simulate streaming delay
    const mockResponse = randomResponse();
    const words = mockResponse.text.split(' ');

    // Stream text deltas (one word at a time)
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 80 + Math.random() * 120));
      sendSSEEvent(res, 'delta', { text: words[i] + (i < words.length - 1 ? ' ' : '') });
    }

    // Stream tool calls
    if (mockResponse.toolCalls && mockResponse.toolCalls.length > 0) {
      for (const toolCall of mockResponse.toolCalls) {
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSSEEvent(res, 'tool_call', {
          id: `${toolCall.name}-${Date.now()}`,
          name: toolCall.name,
          status: 'running'
        });

        await new Promise(resolve => setTimeout(resolve, 300));
        sendSSEEvent(res, 'tool_result', {
          id: `${toolCall.name}-${Date.now()}`,
          name: toolCall.name,
          status: 'complete',
          result: toolCall.result
        });
      }
    }

    // Send quota + done
    sendSSEEvent(res, 'done', {
      remaining: Math.floor(Math.random() * 9) + 1,
      input_tokens: Math.floor(Math.random() * 100) + 50,
      output_tokens: Math.floor(Math.random() * 150) + 50
    });

    res.end();
    console.log(`✅ [${new Date().toISOString()}] Served mock response to client`);
    return;
  }

  if (parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '0.1.0 (MOCK)', budget_remaining: 49.99 }));
    return;
  }

  if (parsedUrl.pathname === '/api/quota') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ used: 2, limit: 10, remaining: 8, resets_at: '2026-05-05T23:59:59Z' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`
🔄 MOCK SSE SERVER RUNNING

  URL: http://localhost:${PORT}/api/chat
  
  This server simulates Kimi's backend so Codex can build the UI.
  
  Endpoints:
    POST /api/chat     → streams fake SSE responses
    GET /api/health    → returns mock status
    GET /api/quota     → returns mock quota
  
  When the real backend is ready, swap PORT in Codex's vite.config.ts
  from :${PORT} → :8787
  
  Stop with: Ctrl+C
  `);
});
