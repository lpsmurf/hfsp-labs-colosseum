const express = require('express');
const app = express();

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: 123.456 });
});

// Deploy endpoint
app.post('/api/v1/agents/deploy', (req, res) => {
  const { deployment_id, telegram_token } = req.body;
  
  console.log(`[MOCK HFSP] Deploy request for agent: ${deployment_id}`);
  console.log(`[MOCK HFSP] Telegram token validation: ${telegram_token ? 'provided' : 'missing'}`);
  
  // Validate telegram token format
  if (!telegram_token || !telegram_token.match(/^\d+:[\w-]+$/)) {
    console.log('[MOCK HFSP] Invalid telegram token format');
    return res.status(400).json({
      agent_id: null,
      endpoint: null,
      status: 'error',
      error: 'Invalid telegram token'
    });
  }
  
  // Simulate a successful deployment
  const agent_id = deployment_id || `agent_${Date.now()}`;
  
  res.json({
    agent_id: agent_id,
    endpoint: `https://console.hfsp.io/${agent_id}`,
    status: 'provisioning',
    error: null
  });
});

app.listen(3001, () => {
  console.log('[MOCK HFSP] Server running on port 3001');
});
