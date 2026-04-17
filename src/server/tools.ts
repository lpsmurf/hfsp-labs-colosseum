import { Tool } from '@modelcontextprotocol/sdk/types';
import {
  ToolInputSchemas,
  ListTiersOutputSchema,
  QuoteTierOutputSchema,
  DeployAgentOutputSchema,
  GetDeploymentStatusOutputSchema,
  CancelSubscriptionOutputSchema,
  RenewSubscriptionInputSchema,
  RenewSubscriptionOutputSchema,
} from './schemas';
import { listTiers, getTier, quoteTier } from '../services/tier';
import { verifyPayment } from '../services/payment';
import { verifyPaymentTransaction } from '../integrations/helius';
import { CLAWDROP_CONFIG } from '../config/tokens';
import {
  saveAgent,
  getAgent,
  listAgents,
  updateAgentStatus,
  loadFromDisk,
  DeployedAgent,
} from '../db/memory';
import { getCredits, topUpCredits, TOOL_COSTS_USD } from '../services/credits';
import { deployViaHFSP, getHFSPStatus, stopViaHFSP, restartViaHFSP } from '../integrations/hfsp';
import { logger } from '../utils/logger';

// Load persisted state on startup
loadFromDisk();

// ─── Tool definitions (JSON Schema for MCP protocol) ─────────────────────────

export const tools: Tool[] = [
  {
    name: 'list_tiers',
    description:
      'List all available Clawdrop deployment tiers with pricing and capacity info. ' +
      'All tiers include access to solana, research, and treasury capability bundles.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'quote_tier',
    description:
      'Get a price quote for a deployment tier in your chosen payment token ' +
      '(SOL, USDT, USDC, or HERD). Bundles do not affect the price.',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: {
          type: 'string',
          description: 'Tier to quote: tier_a (Shared), tier_b (Dedicated), tier_c (Custom)',
        },
        payment_token: {
          type: 'string',
          enum: ['SOL', 'USDT', 'USDC', 'HERD'],
          description: 'Token you want to pay with',
          default: 'SOL',
        },
        bundles: {
          type: 'array',
          items: { type: 'string', enum: ['solana', 'research', 'treasury'] },
          description: 'Capability bundles to include (optional, do not affect price)',
          default: [],
        },
      },
      required: ['tier_id'],
    },
  },
  {
    name: 'deploy_agent',
    description:
      'Deploy a new OpenClaw agent after confirming payment. Provide the transaction hash ' +
      'from your Solana wallet. The agent will be provisioned via HFSP with your chosen bundles.',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: { type: 'string', description: 'Tier to deploy on' },
        agent_name: {
          type: 'string',
          description: 'Display name for your agent (3-64 characters)',
        },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (receives SSH access)',
        },
        payment_token: {
          type: 'string',
          enum: ['SOL', 'USDT', 'USDC', 'HERD'],
          description: 'Token used for payment',
        },
        payment_tx_hash: {
          type: 'string',
          description: 'Transaction signature from your Solana wallet',
        },
        bundles: {
          type: 'array',
          items: { type: 'string', enum: ['solana', 'research', 'treasury'] },
          description: 'Capability bundles to install',
          default: [],
        },
        telegram_token: {
          type: 'string',
          description:
            'Telegram bot token from @BotFather — enables your agent on Telegram (optional)',
        },
        llm_provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'openrouter'],
          description: 'LLM provider for your agent (default: anthropic)',
        },
        llm_api_key: {
          type: 'string',
          description: 'API key for your chosen LLM provider',
        },
      },
      required: ['tier_id', 'agent_name', 'owner_wallet', 'payment_token', 'payment_tx_hash'],
    },
  },
  {
    name: 'get_deployment_status',
    description: 'Check the status, subscription health, and recent logs of a deployed agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID returned from deploy_agent',
        },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (proves ownership)',
        },
      },
      required: ['agent_id', 'owner_wallet'],
    },
  },
  {
    name: 'cancel_subscription',
    description:
      'Cancel an active agent subscription. The agent will be stopped immediately. ' +
      'This action is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent ID to cancel' },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (proves ownership)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm — the agent will be stopped permanently',
        },
      },
      required: ['agent_id', 'owner_wallet', 'confirm'],
    },
  },
  {
    name: 'renew_subscription',
    description: 'Renew a Clawdrop agent subscription after payment. Extends the billing period by 30 days and restarts the agent if it was stopped due to non-payment.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to renew (from deploy_agent or get_deployment_status)',
        },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (must match original owner)',
        },
        payment_tx_hash: {
          type: 'string',
          description: 'Transaction signature of your renewal payment on Solana',
        },
        payment_token: {
          type: 'string',
          enum: ['SOL', 'USDC', 'USDT'],
          description: 'Token used for payment (default: SOL)',
        },
      },
      required: ['agent_id', 'owner_wallet', 'payment_tx_hash'],
    },
  },
  {
    name: 'get_credits',
    description: 'Check your agent\'s credit balance for premium tool calls (web search, flight booking, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        owner_wallet: { type: 'string' },
      },
      required: ['agent_id', 'owner_wallet'],
    },
  },
  {
    name: 'top_up_credits',
    description: 'Add USDC credits to your agent for premium tool calls. Send USDC to CLAWDROP_WALLET_ADDRESS then provide the tx hash.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        owner_wallet: { type: 'string' },
        amount_usd: { type: 'number', description: 'Amount in USD to credit' },
        payment_tx_hash: { type: 'string', description: 'Transaction hash of your USDC payment' },
      },
      required: ['agent_id', 'owner_wallet', 'amount_usd', 'payment_tx_hash'],
    },
  },
];

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

export async function handleToolCall(toolName: string, toolInput: unknown): Promise<string> {
  logger.info({ tool: toolName }, 'Tool call received');
  try {
    switch (toolName) {
      case 'list_tiers':          return await handleListTiers(toolInput);
      case 'quote_tier':          return await handleQuoteTier(toolInput);
      case 'deploy_agent':        return await handleDeployAgent(toolInput);
      case 'get_deployment_status': return await handleGetDeploymentStatus(toolInput);
      case 'cancel_subscription': return await handleCancelSubscription(toolInput);
      case 'renew_subscription': return await handleRenewSubscription(toolInput);
      case 'get_credits':       return await handleGetCredits(toolInput);
      case 'top_up_credits':    return await handleTopUpCredits(toolInput);
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error({ error, tool: toolName }, 'Tool execution failed');
    throw error;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleListTiers(input: unknown): Promise<string> {
  ToolInputSchemas.list_tiers.parse(input);

  const tiers = listTiers();
  const response = ListTiersOutputSchema.parse({
    tiers: tiers.map(t => ({
      tier_id: t.id,
      name: t.name,
      description: t.description,
      price_usd: t.price_usd,
      vps_type: t.vps_type,
      vps_capacity: t.vps_capacity,
      available_bundles: ['solana', 'research', 'treasury'],
    })),
  });

  return JSON.stringify(response, null, 2);
}

async function handleQuoteTier(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.quote_tier.parse(input);

  // quoteTier returns { tier, payment: PaymentQuote, bundles_available }
  const tierQuote = await quoteTier(parsed.tier_id, parsed.payment_token);

  const { tier, payment } = tierQuote;

  // Calculate fee_usd from business rule (smart fee: <$100 flat $1, ≥$100 → 0.35%)
  const fee_usd =
    payment.tier_price_usd < 100
      ? 1.0
      : parseFloat((payment.tier_price_usd * 0.0035).toFixed(2));

  const fee_breakdown =
    payment.tier_price_usd < 100
      ? 'Flat fee: $1.00 (transactions under $100)'
      : `0.35% swap fee: $${fee_usd.toFixed(2)} (on $${payment.tier_price_usd.toFixed(2)})`;

  const response = QuoteTierOutputSchema.parse({
    tier_id: tier.id,
    tier_name: tier.name,
    price_usd: payment.tier_price_usd,
    price_in_token: payment.amount_to_send,
    payment_token: parsed.payment_token,
    fee_usd,
    fee_breakdown,
    bundles_included: parsed.bundles,
    quote_expires_at: payment.expires_at.toISOString(),
  });

  return JSON.stringify(response, null, 2);
}

async function handleDeployAgent(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.deploy_agent.parse(input);

  // 1. Verify payment on-chain
  if (parsed.payment_tx_hash.startsWith('devnet_') || parsed.payment_tx_hash.startsWith('test_')) {
    // Dev mode: skip verification for test hashes
    logger.info('[DEV] Skipping on-chain verification for test tx: ' + parsed.payment_tx_hash);
  } else {
    // Production: full on-chain verification via Helius
    const tier = getTier(parsed.tier_id);
    if (!tier) throw new Error(`Tier not found: ${parsed.tier_id}`);
    const verification = await verifyPaymentTransaction({
      tx_hash: parsed.payment_tx_hash,
      expected_recipient: CLAWDROP_CONFIG.WALLET_ADDRESS,
      min_amount_sol: tier.price_sol,
      network: 'mainnet',
    });
    if (!verification.verified) {
      throw new Error('Payment verification failed: ' + verification.reason);
    }
    logger.info({ tx_hash: parsed.payment_tx_hash, amount: verification.actual_amount_sol }, 'Payment verified on-chain');
  }

  // 2. Get tier info
  const tier = getTier(parsed.tier_id);
  if (!tier) throw new Error(`Tier not found: ${parsed.tier_id}`);

  // Enforce max agents per wallet per tier
  const walletAgents = listAgents(parsed.owner_wallet).filter(a => a.status === 'running' || a.status === 'provisioning');
  if (walletAgents.length >= tier.max_agents) {
    throw new Error(
      `Max agents reached for ${tier.name}: ${tier.max_agents} agent(s) allowed. ` +
      `You have ${walletAgents.length} running. Cancel one or upgrade your tier.`
    );
  }

  // 3. Deploy via HFSP
  const agent_id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payment_id = `pay_${Date.now()}`;

  const hfspResp = await deployViaHFSP({
    deployment_id: agent_id,
    tier_id: parsed.tier_id,
    region: 'eu-west',
    capability_bundle: parsed.bundles.join(',') || 'none',
    payment_verified: true,
    wallet_address: parsed.owner_wallet,
    telegram_token: (parsed as any).telegram_token,
    llm_provider: (parsed as any).llm_provider || 'anthropic',
    llm_api_key: (parsed as any).llm_api_key,
    config: {
      agent_name: parsed.agent_name,
      installed_bundles: parsed.bundles,
    },
  });

  if (hfspResp.error) {
    throw new Error(`HFSP provisioning failed: ${hfspResp.error}`);
  }

  // 4. Persist to DB
  const now = new Date();
  const nextPayment = new Date(now);
  nextPayment.setDate(nextPayment.getDate() + 30);

  const agent: DeployedAgent = {
    agent_id: hfspResp.agent_id,
    tier_id: parsed.tier_id,
    agent_name: parsed.agent_name,
    owner_wallet: parsed.owner_wallet,
    bundles: parsed.bundles as DeployedAgent['bundles'],
    status: 'provisioning',
    console_url: hfspResp.endpoint,
    deployed_at: now,
    last_activity: now,
    subscription: {
      tier_id: parsed.tier_id,
      amount_usd: tier.price_usd,
      payment_token: parsed.payment_token,
      started_at: now,
      next_payment_due: nextPayment,
      grace_period_end: null,
      payment_history: [
        {
          payment_id,
          amount: tier.price_sol,
          token: parsed.payment_token,
          tx_hash: parsed.payment_tx_hash,
          timestamp: now,
          fee_charged_usd: tier.price_usd < 100 ? 1.0 : tier.price_usd * 0.0035,
          jupiter_swap: parsed.payment_token !== 'SOL',
        },
      ],
    },
    logs: [
      {
        timestamp: now,
        level: 'info',
        message: `Provisioning started. Tier: ${parsed.tier_id}. Bundles: ${
          parsed.bundles.join(', ') || 'none'
        }`,
      },
    ],
  };

  saveAgent(agent);

  logger.info(
    { agent_id: agent.agent_id, tier_id: parsed.tier_id, bundles: parsed.bundles },
    'Agent deployed'
  );

  const response = DeployAgentOutputSchema.parse({
    agent_id: agent.agent_id,
    agent_name: parsed.agent_name,
    tier_id: parsed.tier_id,
    status: 'provisioning',
    bundles: parsed.bundles,
    deployed_at: now.toISOString(),
    next_payment_due: nextPayment.toISOString(),
    console_url: hfspResp.endpoint,
    message:
      `Agent "${parsed.agent_name}" is being provisioned on ${tier.name}. ` +
      `SSH access at ${hfspResp.endpoint ?? 'your VPS IP'} once running. ` +
      `Next payment due: ${nextPayment.toLocaleDateString()}.`,
  });

  return JSON.stringify(response, null, 2);
}

async function handleGetDeploymentStatus(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.get_deployment_status.parse(input);

  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error(`Agent not found: ${parsed.agent_id}`);

  // Ownership check — prevents IDOR
  if (agent.owner_wallet !== parsed.owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  // Poll HFSP for live status
  const hfspStatus = await getHFSPStatus(parsed.agent_id);
  if (!hfspStatus.error && hfspStatus.status) {
    updateAgentStatus(parsed.agent_id, hfspStatus.status as DeployedAgent['status']);
  }

  const fresh = getAgent(parsed.agent_id)!;
  const uptimeSeconds = Math.floor((Date.now() - fresh.deployed_at.getTime()) / 1000);

  // Build warning message if in grace period or overdue
  let warning: string | null = null;
  const now = new Date();
  if (fresh.subscription.grace_period_end && now < fresh.subscription.grace_period_end) {
    const hoursLeft = Math.round((fresh.subscription.grace_period_end.getTime() - now.getTime()) / 3_600_000);
    warning = `⚠️ Payment overdue — agent stops in ${hoursLeft}h. Run renew_subscription to continue.`;
  } else if (now > fresh.subscription.next_payment_due) {
    warning = `⚠️ Payment overdue. Renewal required immediately or agent will be stopped.`;
  }

  const response = GetDeploymentStatusOutputSchema.parse({
    agent_id: fresh.agent_id,
    agent_name: fresh.agent_name,
    tier_id: fresh.tier_id,
    status: fresh.status,
    bundles: fresh.bundles,
    vps_ip: fresh.vps_ip,
    console_url: fresh.console_url,
    uptime_seconds: uptimeSeconds,
    last_activity: fresh.last_activity.toISOString(),
    subscription: {
      next_payment_due: fresh.subscription.next_payment_due.toISOString(),
      grace_period_end: fresh.subscription.grace_period_end?.toISOString() ?? null,
      amount_usd: fresh.subscription.amount_usd,
      payment_token: fresh.subscription.payment_token,
      payments_made: fresh.subscription.payment_history.length,
    },
    recent_logs: fresh.logs.slice(-10).map(l => ({
      timestamp: l.timestamp.toISOString(),
      level: l.level,
      message: l.message,
    })),
    warning,
  });

  return JSON.stringify(response, null, 2);
}

async function handleCancelSubscription(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.cancel_subscription.parse(input);

  if (!parsed.confirm) {
    throw new Error('Cancellation requires confirm: true');
  }

  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error(`Agent not found: ${parsed.agent_id}`);

  // Ownership check — prevents IDOR
  if (agent.owner_wallet !== parsed.owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  if (agent.status === 'stopped') {
    throw new Error(`Agent ${parsed.agent_id} is already stopped`);
  }

  await stopViaHFSP(parsed.agent_id);
  updateAgentStatus(parsed.agent_id, 'stopped');

  logger.info({ agent_id: parsed.agent_id }, 'Agent subscription cancelled');

  const response = CancelSubscriptionOutputSchema.parse({
    agent_id: parsed.agent_id,
    status: 'stopped',
    message:
      `Agent "${agent.agent_name}" has been stopped and subscription cancelled. ` +
      'Your VPS will be decommissioned shortly.',
    stopped_at: new Date().toISOString(),
  });

  return JSON.stringify(response, null, 2);
}

async function handleRenewSubscription(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.renew_subscription.parse(input);

  // Ownership check
  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error(`Agent not found: ${parsed.agent_id}`);
  if (agent.owner_wallet !== parsed.owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  // Payment verification (same pattern as deploy_agent)
  const agentTier = getTier(agent.tier_id);
  if (!agentTier) throw new Error(`Tier not found: ${agent.tier_id}`);

  if (parsed.payment_tx_hash.startsWith('devnet_') || parsed.payment_tx_hash.startsWith('test_')) {
    logger.info('[DEV] Skipping on-chain verification for renewal: ' + parsed.payment_tx_hash);
  } else {
    const verification = await verifyPaymentTransaction({
      tx_hash: parsed.payment_tx_hash,
      expected_recipient: CLAWDROP_CONFIG.WALLET_ADDRESS,
      min_amount_sol: agentTier.price_sol,
      network: 'mainnet',
    });
    if (!verification.verified) {
      throw new Error('Renewal payment verification failed: ' + verification.reason);
    }
  }

  const wasStopped = agent.status === 'stopped';

  // Extend subscription by 30 days from now (or from next_payment_due if in the future)
  const baseDate = agent.subscription.next_payment_due > new Date()
    ? agent.subscription.next_payment_due
    : new Date();
  const renewedUntil = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Update agent subscription dates + clear grace period
  agent.subscription.next_payment_due = renewedUntil;
  agent.subscription.grace_period_end = null;
  agent.subscription.payment_history.push({
    payment_id: `pay_renewal_${Date.now()}`,
    amount: agentTier.price_sol,
    token: parsed.payment_token,
    tx_hash: parsed.payment_tx_hash,
    timestamp: new Date(),
    fee_charged_usd: agentTier.price_usd < 100 ? 1.0 : agentTier.price_usd * 0.0035,
    jupiter_swap: parsed.payment_token !== 'SOL',
  });

  // Restart via HFSP if agent was stopped
  let restarted = false;
  if (wasStopped) {
    try {
      await restartViaHFSP(parsed.agent_id);
      updateAgentStatus(parsed.agent_id, 'running');
      restarted = true;
      logger.info({ agent_id: parsed.agent_id }, 'Agent restarted after renewal');
    } catch (err) {
      logger.error({ agent_id: parsed.agent_id, err }, 'Failed to restart agent after renewal');
    }
  } else {
    updateAgentStatus(parsed.agent_id, 'running');
  }

  const response = RenewSubscriptionOutputSchema.parse({
    agent_id: parsed.agent_id,
    status: restarted || !wasStopped ? 'running' : 'stopped',
    renewed_until: renewedUntil.toISOString(),
    message: wasStopped
      ? `Agent "${agent.agent_name}" renewed and restarted. Active until ${renewedUntil.toLocaleDateString()}.`
      : `Subscription renewed. Agent "${agent.agent_name}" active until ${renewedUntil.toLocaleDateString()}.`,
    was_stopped: wasStopped,
    restarted,
  });

  return JSON.stringify(response, null, 2);
}

async function handleGetCredits(input: unknown): Promise<string> {
  const { agent_id, owner_wallet } = (await import('zod')).z.object({ agent_id: (await import('zod')).z.string(), owner_wallet: (await import('zod')).z.string() }).parse(input);
  const agent = getAgent(agent_id);
  if (!agent) throw new Error('Agent not found');
  if (agent.owner_wallet !== owner_wallet) throw new Error('Unauthorized');
  const ledger = getCredits(agent_id);
  return JSON.stringify({
    agent_id,
    balance_usd: ledger.balance_usd,
    total_spent_usd: ledger.total_spent_usd,
    recent_transactions: ledger.transactions.slice(-10),
    tool_costs: TOOL_COSTS_USD,
  }, null, 2);
}

async function handleTopUpCredits(input: unknown): Promise<string> {
  const { z } = await import('zod');
  const parsed = z.object({
    agent_id: z.string(),
    owner_wallet: z.string(),
    amount_usd: z.number().positive(),
    payment_tx_hash: z.string(),
  }).parse(input);

  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error('Agent not found');
  if (agent.owner_wallet !== parsed.owner_wallet) throw new Error('Unauthorized');

  // Dev bypass
  if (!parsed.payment_tx_hash.startsWith('devnet_') && !parsed.payment_tx_hash.startsWith('test_')) {
    // TODO: verify USDC payment on-chain (use verifyPaymentTransaction adapted for USDC)
    logger.info({ tx: parsed.payment_tx_hash }, 'Credit top-up payment (mainnet verify TODO)');
  }

  const ledger = topUpCredits(parsed.agent_id, parsed.amount_usd, parsed.payment_tx_hash);
  return JSON.stringify({
    success: true,
    agent_id: parsed.agent_id,
    credited_usd: parsed.amount_usd,
    new_balance_usd: ledger.balance_usd,
    message: `$${parsed.amount_usd} credits added. Balance: $${ledger.balance_usd.toFixed(4)}`,
  }, null, 2);
}
