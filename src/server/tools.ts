import { Tool } from '@modelcontextprotocol/sdk/types';
import { 
  ToolInputMap,
  ListTiersResponseSchema,
  QuoteTierResponseSchema,
  VerifyPaymentResponseSchema,
  DeployOpenclawInstanceResponseSchema,
  GetDeploymentStatusResponseSchema,
} from './schemas';
import { readTiersFromFile } from '../services/tiers';
import { getSOLPrice } from '../integrations/helius';
import { 
  saveDeployment, 
  getDeployment, 
  savePayment, 
  getPayment,
  updatePaymentStatus,
  updateDeploymentStatus,
  addDeploymentLog,
} from '../db/memory';
import { Deployment } from '../models/deployment';
import { logger } from '../utils/logger';

export const tools: Tool[] = [
  {
    name: 'list_tiers',
    description: 'List all available Clawdrop tiers (services) that can be deployed and provisioned',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'quote_tier',
    description: 'Get a price quote for a tier in SOL or HERD tokens',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: {
          type: 'string',
          description: 'The ID of the tier to quote',
        },
        token: {
          type: 'string',
          enum: ['sol', 'herd'],
          description: 'Token to quote in (SOL or HERD)',
        },
      },
      required: ['tier_id'],
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify a Solana devnet transaction for payment',
    inputSchema: {
      type: 'object',
      properties: {
        payment_id: {
          type: 'string',
          description: 'The payment ID to verify',
        },
        tx_hash: {
          type: 'string',
          description: 'The Solana devnet transaction hash',
        },
      },
      required: ['payment_id', 'tx_hash'],
    },
  },
  {
    name: 'deploy_openclaw_instance',
    description: 'Deploy a new OpenClaw agent instance after payment is confirmed',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: {
          type: 'string',
          description: 'The tier ID to deploy',
        },
        payment_id: {
          type: 'string',
          description: 'The payment ID that verified this deployment',
        },
        agent_name: {
          type: 'string',
          description: 'Human-readable name for the deployed agent',
        },
        agent_description: {
          type: 'string',
          description: 'Description of the agent purpose',
        },
        wallet_address: {
          type: 'string',
          description: 'Customer wallet address',
        },
        region: {
          type: 'string',
          description: 'Hosting region (default: us-east)',
        },
        config: {
          type: 'object',
          description: 'Optional custom configuration for the agent',
        },
      },
      required: ['tier_id', 'payment_id', 'agent_name', 'wallet_address'],
    },
  },
  {
    name: 'get_deployment_status',
    description: 'Check the status and health of a deployed OpenClaw instance',
    inputSchema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'The deployment ID returned from deploy_openclaw_instance',
        },
      },
      required: ['deployment_id'],
    },
  },
];

export async function handleToolCall(
  toolName: string,
  toolInput: unknown
): Promise<string> {
  logger.info({ tool: toolName, input: toolInput }, 'Tool call received');

  try {
    switch (toolName) {
      case 'list_tiers':
        return await handleListTiers(toolInput);
      case 'quote_tier':
        return await handleQuoteTier(toolInput);
      case 'verify_payment':
        return await handleVerifyPayment(toolInput);
      case 'deploy_openclaw_instance':
        return await handleDeployOpenclawInstance(toolInput);
      case 'get_deployment_status':
        return await handleGetDeploymentStatus(toolInput);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error({ error, tool: toolName }, 'Tool execution failed');
    throw error;
  }
}

async function handleListTiers(input: unknown): Promise<string> {
  ToolInputMap.list_tiers.parse(input);
  const tiers = await readTiersFromFile();
  const response = ListTiersResponseSchema.parse({
    tiers,
    total_count: tiers.length,
  });
  return JSON.stringify(response);
}

async function handleQuoteTier(input: unknown): Promise<string> {
  const parsed = ToolInputMap.quote_tier.parse(input);
  const tiers = await readTiersFromFile();
  const tier = tiers.find(t => t.id === parsed.tier_id);
  
  if (!tier) {
    throw new Error(`Tier not found: ${parsed.tier_id}`);
  }

  const token = parsed.token || 'sol';
  
  let price: number;
  let estimatedGas: number;
  
  if (token === 'sol') {
    price = tier.price_sol;
    estimatedGas = 0.005; // 5k lamports
  } else {
    price = tier.price_herd;
    estimatedGas = 0;
  }

  const response = QuoteTierResponseSchema.parse({
    tier_id: tier.id,
    tier_name: tier.name,
    price,
    token,
    estimated_gas: estimatedGas,
    total_with_gas: price + estimatedGas,
    valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min validity
  });

  logger.info(
    { 
      tier_id: tier.id, 
      price, 
      token, 
      total: price + estimatedGas 
    },
    'Tier quoted'
  );

  return JSON.stringify(response);
}

async function handleVerifyPayment(input: unknown): Promise<string> {
  const parsed = ToolInputMap.verify_payment.parse(input);
  
  // Get the payment from store
  const payment = getPayment(parsed.payment_id);
  if (!payment) {
    throw new Error(`Payment not found: ${parsed.payment_id}`);
  }

  // TODO: Real Helius verification
  // For now, mark as confirmed if tx_hash provided
  const confirmed = parsed.tx_hash && parsed.tx_hash.length > 0;
  
  if (confirmed) {
    updatePaymentStatus(parsed.payment_id, 'confirmed', parsed.tx_hash);
  } else {
    updatePaymentStatus(parsed.payment_id, 'failed', parsed.tx_hash);
  }

  const solPrice = await getSOLPrice();
  const amountUsd = payment.amount_sol * solPrice;

  const response = VerifyPaymentResponseSchema.parse({
    payment_id: parsed.payment_id,
    verified: confirmed,
    tx_hash: parsed.tx_hash,
    amount_sol: payment.amount_sol,
    amount_usd: amountUsd,
    status: confirmed ? 'confirmed' : 'failed',
    explorer_url: `https://solscan.io/tx/${parsed.tx_hash}?cluster=devnet`,
  });

  logger.info(
    {
      payment_id: parsed.payment_id,
      verified: confirmed,
      amount: payment.amount_sol,
    },
    'Payment verified'
  );

  return JSON.stringify(response);
}

async function handleDeployOpenclawInstance(input: unknown): Promise<string> {
  const parsed = ToolInputMap.deploy_openclaw_instance.parse(input);
  const tiers = await readTiersFromFile();
  const tier = tiers.find(t => t.id === parsed.tier_id);

  if (!tier) {
    throw new Error(`Tier not found: ${parsed.tier_id}`);
  }

  // Verify payment exists and is confirmed
  const payment = getPayment(parsed.payment_id);
  if (!payment) {
    throw new Error(`Payment not found: ${parsed.payment_id}`);
  }

  if (payment.status !== 'confirmed') {
    throw new Error(`Payment not confirmed: ${parsed.payment_id}`);
  }

  // Generate deployment ID and agent ID
  const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const agentId = `agent_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create deployment record
  const deployment: Deployment = {
    deployment_id: deploymentId,
    tier_id: parsed.tier_id,
    agent_id: agentId,
    agent_name: parsed.agent_name,
    wallet_address: parsed.wallet_address,
    payment_id: parsed.payment_id,
    status: 'provisioning',
    endpoint: null,
    console_url: `https://clawdrop.live/agent/${agentId}`,
    region: parsed.region || 'us-east',
    capability_bundle: tier.capability_bundle,
    config: parsed.config,
    deployed_at: new Date(),
    last_activity: new Date(),
    logs: [
      {
        timestamp: new Date(),
        level: 'info',
        message: 'Deployment provisioning started',
      },
    ],
  };

  // Save to memory store
  saveDeployment(deployment);

  logger.info(
    {
      deployment_id: deploymentId,
      agent_id: agentId,
      tier_id: parsed.tier_id,
    },
    'Deployment created and saved to memory'
  );

  const response = DeployOpenclawInstanceResponseSchema.parse({
    deployment_id: deploymentId,
    agent_id: agentId,
    agent_name: parsed.agent_name,
    status: 'provisioning',
    deployed_at: new Date().toISOString(),
    console_url: `https://clawdrop.live/agent/${agentId}`,
  });

  return JSON.stringify(response);
}

async function handleGetDeploymentStatus(input: unknown): Promise<string> {
  const parsed = ToolInputMap.get_deployment_status.parse(input);

  // Get from memory store
  const deployment = getDeployment(parsed.deployment_id);

  if (!deployment) {
    throw new Error(`Deployment not found: ${parsed.deployment_id}`);
  }

  const response = GetDeploymentStatusResponseSchema.parse({
    deployment_id: deployment.deployment_id,
    agent_id: deployment.agent_id,
    status: deployment.status,
    uptime_seconds: Math.floor((Date.now() - deployment.deployed_at.getTime()) / 1000),
    last_activity: deployment.last_activity.toISOString(),
    endpoint: deployment.endpoint || undefined,
    logs: deployment.logs.map(log => ({
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      message: log.message,
    })),
  });

  logger.info({ deployment_id: parsed.deployment_id }, 'Deployment status retrieved');

  return JSON.stringify(response);
}
