/**
 * Advanced Clawdrop Demo
 * Full end-to-end workflow showcasing all features
 */

import { handleToolCall } from '../src/server/tools';
import { listAgents } from '../src/db/memory';

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message: string): void {
  console.log(message);
}

function section(title: string): void {
  log(`\n${CYAN}${BOLD}═══ ${title} ═══${RESET}\n`);
}

function success(message: string): void {
  log(`${GREEN}✓ ${message}${RESET}`);
}

function info(message: string): void {
  log(`${CYAN}ℹ ${message}${RESET}`);
}

function demo(message: string): void {
  log(`${YELLOW}▶ ${message}${RESET}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAdvancedDemo(): Promise<void> {
  log(`\n${CYAN}${BOLD}${'═'.repeat(70)}${RESET}`);
  log(CYAN + '          🚀 CLAWDROP MCP - ADVANCED DEMO WORKFLOW' + RESET);
  log(`${CYAN}${'═'.repeat(70)}${RESET}\n`);

  // ============ SECTION 1: CATALOG & PRICING ============
  section('1. SERVICE DISCOVERY & PRICING');

  demo('List all available Clawdrop services');
  const listResult = await handleToolCall('list_services', {});
  const services = JSON.parse(listResult);
  success(`Found ${services.total_count} services available`);
  log(`\n  Service Categories:`);

  const categories = {} as Record<string, any[]>;
  services.services.forEach((s: any) => {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s);
  });

  Object.entries(categories).forEach(([cat, items]: [string, any]) => {
    log(`    ${BOLD}${cat.toUpperCase()}${RESET} (${items.length})`);
    (items as any[]).forEach(s => {
      log(`      • ${s.name}: ${GREEN}${s.price_sol} SOL${RESET} / ${s.price_herd} HERD`);
    });
  });

  await sleep(1000);

  // ============ SECTION 2: QUOTING DIFFERENT SERVICES ============
  section('2. PRICE QUOTING - MULTIPLE SERVICES');

  const servicesToQuote = [
    { id: 'treasury-agent', name: 'Treasury Agent' },
    { id: 'treasury-agent-pro', name: 'Treasury Agent Pro' },
    { id: 'research-execution', name: 'Research-to-Execution' },
    { id: 'payout-agent-plus', name: 'Global Payout Agent Plus' },
  ];

  for (const service of servicesToQuote) {
    demo(`Quote ${service.name} in SOL`);
    const quoteResult = await handleToolCall('quote_service', {
      service_id: service.id,
      token: 'sol',
    });
    const quote = JSON.parse(quoteResult);
    success(
      `${quote.service_name}: ${GREEN}${quote.price} SOL${RESET} + ${quote.estimated_gas} gas = ${GREEN}${quote.total_with_gas} SOL${RESET}`
    );
    await sleep(300);
  }

  // ============ SECTION 3: PAYMENTS & DEPLOYMENTS ============
  section('3. PAYMENTS & AGENT DEPLOYMENTS');

  const deploymentsToMake = [
    { id: 'treasury-agent', name: 'My Treasury Manager' },
    { id: 'research-execution-pro', name: 'Research Agent Alpha' },
    { id: 'portfolio-monitor-pro', name: 'Portfolio Monitor' },
  ];

  const deployedAgents: string[] = [];

  for (const deployment of deploymentsToMake) {
    demo(`Process payment for ${deployment.name}`);
    const payResult = await handleToolCall('pay_with_sol', {
      service_id: deployment.id,
      amount_sol: 5.0,
      wallet_pubkey: '8xDWbVyBPCL3dqAg9YEZNqDQxEjgAGHYRvRN5fKqjVB2',
      approve: true,
    });
    const payment = JSON.parse(payResult);
    success(`Payment confirmed: ${GREEN}${payment.tx_hash.substring(0, 20)}...${RESET}`);

    demo(`Deploy agent: ${deployment.name}`);
    const agentResult = await handleToolCall('create_openclaw_agent', {
      service_id: deployment.id,
      agent_name: deployment.name,
      agent_description: `Deployed ${deployment.name} via Clawdrop MCP`,
    });
    const agent = JSON.parse(agentResult);
    success(
      `Agent deployed: ${GREEN}${agent.agent_id.substring(0, 20)}...${RESET} (${agent.status})`
    );
    deployedAgents.push(agent.agent_id);
    await sleep(300);
  }

  // ============ SECTION 4: STATUS MONITORING ============
  section('4. AGENT STATUS & MONITORING');

  for (const agentId of deployedAgents) {
    demo(`Check status of ${agentId.substring(0, 20)}...`);
    const statusResult = await handleToolCall('get_agent_status', { agent_id: agentId });
    const status = JSON.parse(statusResult);
    
    const statusColor = status.status === 'running' ? GREEN : YELLOW;
    success(
      `Status: ${statusColor}${status.status}${RESET} | Uptime: ${status.uptime_seconds}s | Logs: ${status.logs?.length || 0}`
    );
    
    if (status.logs && status.logs.length > 0) {
      log(`    Latest logs:`);
      status.logs.slice(-2).forEach((logEntry: any) => {
        log(`      • ${CYAN}${logEntry.level}${RESET}: ${logEntry.message}`);
      });
    }
    await sleep(300);
  }

  // ============ SECTION 5: SUMMARY STATS ============
  section('5. DEPLOYMENT SUMMARY');

  const allAgents = listAgents();
  info(`Total agents deployed: ${BOLD}${allAgents.length}${RESET}`);
  info(`Services utilized: ${BOLD}${deploymentsToMake.length}${RESET}`);
  info(`Total transaction volume: ${BOLD}${deploymentsToMake.length * 5} SOL${RESET}`);

  const statusCounts = {
    running: allAgents.filter(a => a.status === 'running').length,
    provisioning: allAgents.filter(a => a.status === 'provisioning').length,
    failed: allAgents.filter(a => a.status === 'failed').length,
  };

  log(`\n  Status breakdown:`);
  log(`    ${GREEN}●${RESET} Running: ${statusCounts.running}`);
  log(`    ${YELLOW}●${RESET} Provisioning: ${statusCounts.provisioning}`);
  log(`    ${statusCounts.failed > 0 ? '\x1b[31m' : CYAN}●${RESET} Failed: ${statusCounts.failed}`);

  // ============ DEMO COMPLETE ============
  section('✅ DEMO COMPLETE');

  log(`${GREEN}All MCP tools demonstrated successfully!${RESET}\n`);
  log(`${BOLD}What we showed:${RESET}`);
  log(`  ✓ Service discovery (${services.total_count} services)`);
  log(`  ✓ Price quoting with gas fees`);
  log(`  ✓ Simulated payments on devnet`);
  log(`  ✓ Agent deployment & persistence`);
  log(`  ✓ Real-time status monitoring`);
  log(`  ✓ Log aggregation\n`);

  log(`${BOLD}Ready for Friday's demo in Claude Code! 🚀${RESET}\n`);
}

runAdvancedDemo().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
