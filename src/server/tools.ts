import { Tool } from '@modelcontextprotocol/sdk/types';
import { 
  ToolInputMap, 
  Service,
  ListServicesResponseSchema,
  QuoteServiceResponseSchema,
  PayWithSolResponseSchema,
  CreateOpenclawAgentResponseSchema,
  GetAgentStatusResponseSchema,
} from './schemas';
import { readServicesFromFile } from '../services/catalog';
import { getSOLPrice, getHERDPrice } from '../integrations/helius';
import { logger } from '../utils/logger';

export const tools: Tool[] = [
  {
    name: 'list_services',
    description: 'List all available Clawdrop services that can be deployed and provisioned',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'quote_service',
    description: 'Get a price quote for a service in SOL or HERD tokens',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'The ID of the service to quote',
        },
        token: {
          type: 'string',
          enum: ['sol', 'herd'],
          description: 'Token to quote in (SOL or HERD)',
        },
      },
      required: ['service_id'],
    },
  },
  {
    name: 'pay_with_sol',
    description: 'Pay for a service using SOL on devnet. Requires user approval.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'The service to purchase',
        },
        amount_sol: {
          type: 'number',
          description: 'Amount of SOL to send',
        },
        wallet_pubkey: {
          type: 'string',
          description: 'Your Solana wallet public key',
        },
        approve: {
          type: 'boolean',
          description: 'User approval for payment',
        },
      },
      required: ['service_id', 'amount_sol', 'wallet_pubkey', 'approve'],
    },
  },
  {
    name: 'create_openclaw_agent',
    description: 'Deploy a new OpenClaw agent after payment is confirmed',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'The service ID that was purchased',
        },
        agent_name: {
          type: 'string',
          description: 'Human-readable name for the deployed agent',
        },
        agent_description: {
          type: 'string',
          description: 'Description of the agent purpose',
        },
        config: {
          type: 'object',
          description: 'Optional custom configuration for the agent',
        },
      },
      required: ['service_id', 'agent_name'],
    },
  },
  {
    name: 'get_agent_status',
    description: 'Check the status and health of a deployed OpenClaw agent',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID returned from create_openclaw_agent',
        },
      },
      required: ['agent_id'],
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
      case 'list_services':
        return await handleListServices(toolInput);
      case 'quote_service':
        return await handleQuoteService(toolInput);
      case 'pay_with_sol':
        return await handlePayWithSol(toolInput);
      case 'create_openclaw_agent':
        return await handleCreateAgent(toolInput);
      case 'get_agent_status':
        return await handleGetAgentStatus(toolInput);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error({ error, tool: toolName }, 'Tool execution failed');
    throw error;
  }
}

async function handleListServices(input: unknown): Promise<string> {
  ToolInputMap.list_services.parse(input);
  const services = await readServicesFromFile();
  const response = ListServicesResponseSchema.parse({
    services,
    total_count: services.length,
  });
  return JSON.stringify(response);
}

async function handleQuoteService(input: unknown): Promise<string> {
  const parsed = ToolInputMap.quote_service.parse(input);
  const services = await readServicesFromFile();
  const service = services.find(s => s.id === parsed.service_id);
  
  if (!service) {
    throw new Error(`Service not found: ${parsed.service_id}`);
  }

  const token = parsed.token || 'sol';
  
  let price: number;
  let estimatedGas: number;
  
  if (token === 'sol') {
    price = service.price_sol;
    estimatedGas = 0.005; // 5k lamports
  } else {
    price = service.price_herd;
    estimatedGas = 0;
  }

  const response = QuoteServiceResponseSchema.parse({
    service_id: service.id,
    service_name: service.name,
    price,
    token,
    estimated_gas: estimatedGas,
    total_with_gas: price + estimatedGas,
    valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min validity
  });

  logger.info(
    { 
      service_id: service.id, 
      price, 
      token, 
      total: price + estimatedGas 
    },
    'Service quoted'
  );

  return JSON.stringify(response);
}

async function handlePayWithSol(input: unknown): Promise<string> {
  const parsed = ToolInputMap.pay_with_sol.parse(input);

  if (!parsed.approve) {
    throw new Error('Payment requires user approval');
  }

  // For demo: simulate devnet transaction
  const mockTxHash = `devnet_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  logger.info(
    {
      service_id: parsed.service_id,
      amount: parsed.amount_sol,
      wallet: parsed.wallet_pubkey,
      tx_hash: mockTxHash,
    },
    'Payment processed (simulated for demo)'
  );

  const response = PayWithSolResponseSchema.parse({
    tx_hash: mockTxHash,
    status: 'confirmed',
    amount_sol: parsed.amount_sol,
    timestamp: new Date().toISOString(),
  });

  return JSON.stringify(response);
}

async function handleCreateAgent(input: unknown): Promise<string> {
  const parsed = ToolInputMap.create_openclaw_agent.parse(input);
  const services = await readServicesFromFile();
  const service = services.find(s => s.id === parsed.service_id);

  if (!service) {
    throw new Error(`Service not found: ${parsed.service_id}`);
  }

  // Mock agent deployment
  const agentId = `agent_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  logger.info(
    {
      agent_id: agentId,
      agent_name: parsed.agent_name,
      service_id: parsed.service_id,
    },
    'Agent deployment initiated'
  );

  const response = CreateOpenclawAgentResponseSchema.parse({
    agent_id: agentId,
    agent_name: parsed.agent_name,
    status: 'provisioning',
    deployed_at: new Date().toISOString(),
    console_url: `https://clawdrop.live/agent/${agentId}`,
  });

  return JSON.stringify(response);
}

async function handleGetAgentStatus(input: unknown): Promise<string> {
  const parsed = ToolInputMap.get_agent_status.parse(input);

  // Mock status response
  const response = GetAgentStatusResponseSchema.parse({
    agent_id: parsed.agent_id,
    status: 'running',
    uptime_seconds: Math.floor(Math.random() * 3600),
    last_activity: new Date(Date.now() - Math.random() * 60000).toISOString(),
    logs: [
      {
        timestamp: new Date(Date.now() - 30000).toISOString(),
        level: 'info',
        message: 'Agent initialized successfully',
      },
      {
        timestamp: new Date(Date.now() - 10000).toISOString(),
        level: 'info',
        message: 'Connected to Solana devnet',
      },
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Agent running and monitoring',
      },
    ],
  });

  logger.info({ agent_id: parsed.agent_id }, 'Agent status retrieved');

  return JSON.stringify(response);
}
