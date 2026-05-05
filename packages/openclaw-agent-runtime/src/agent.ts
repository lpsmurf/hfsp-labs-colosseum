import 'dotenv/config';
import express from 'express';

const USER_ID = process.env.USER_ID ?? 'unknown';
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3002';
const LOOP_INTERVAL = parseInt(process.env.LOOP_INTERVAL_SECONDS ?? '60', 10) * 1000;
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3999', 10);

let loopCount = 0;
let lastRun: string | null = null;
let status: 'running' | 'idle' | 'error' = 'idle';

// Health endpoint — openclaw-platform polls this to check if agent is alive
const app = express();
app.get('/health', (_req, res) => {
  res.json({
    status,
    user_id: USER_ID,
    mcp_url: MCP_URL,
    loop_count: loopCount,
    last_run: lastRun,
    uptime_seconds: Math.floor(process.uptime()),
  });
});
app.listen(HEALTH_PORT, () => {
  console.log(`[agent] User ${USER_ID} — health on port ${HEALTH_PORT}`);
});

async function runLoop(): Promise<void> {
  loopCount++;
  lastRun = new Date().toISOString();
  status = 'running';

  console.log(`[agent] Loop #${loopCount} — ${lastRun}`);

  try {
    // TODO: connect to MCP server and run strategy
    // For now: placeholder that logs and waits
    // Kimi / Phase 2: implement actual strategy execution via MCP client

    console.log(`[agent] Connecting to MCP at ${MCP_URL}`);
    // const tools = await mcpClient.listTools();
    // const result = await strategy.run(tools);
    // console.log(`[agent] Strategy result:`, result);

    status = 'idle';
  } catch (err) {
    status = 'error';
    console.error(`[agent] Loop error:`, err instanceof Error ? err.message : err);
  }
}

// Run immediately, then on interval
console.log(`[agent] Starting autonomous agent for user ${USER_ID}`);
console.log(`[agent] MCP server: ${MCP_URL}`);
console.log(`[agent] Loop interval: ${LOOP_INTERVAL / 1000}s`);

runLoop();
setInterval(runLoop, LOOP_INTERVAL);
