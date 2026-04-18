/**
 * Clawdrop Monitoring CLI
 * Real-time dashboard for agents, pricing, and system stats
 */

import { listAgents, getStats, getAgent } from '../src/db/memory';
import { getCachedPrice } from '../src/integrations/helius';
import { readServicesFromFile } from '../src/services/catalog';
import { logger } from '../src/utils/logger';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

function divider(width: number = 80): string {
  return '─'.repeat(width);
}

function header(title: string): void {
  console.clear();
  console.log(`\n${CYAN}${BOLD}${'═'.repeat(80)}${RESET}`);
  console.log(CYAN + center(title, 80) + RESET);
  console.log(`${CYAN}${'═'.repeat(80)}${RESET}\n`);
}

function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return GREEN;
    case 'provisioning':
      return YELLOW;
    case 'failed':
      return RED;
    default:
      return CYAN;
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function displayAgents(): Promise<void> {
  const agents = listAgents();
  
  console.log(`${BOLD}📊 Deployed Agents (${agents.length})${RESET}\n`);

  if (agents.length === 0) {
    console.log(DIM + '  No agents deployed yet' + RESET);
    return;
  }

  agents.forEach((agent, i) => {
    const statusStr = statusColor(agent.status) + agent.status + RESET;
    const uptime = formatUptime(
      Math.floor((Date.now() - agent.deployed_at.getTime()) / 1000)
    );
    const logCount = agent.logs.length;

    console.log(`  ${i + 1}. ${BOLD}${agent.agent_name}${RESET}`);
    console.log(
      `     ID: ${DIM}${agent.agent_id}${RESET} | Status: ${statusStr} | Uptime: ${uptime}`
    );
    console.log(
      `     Service: ${agent.service_id} | Logs: ${logCount} | TX: ${agent.payment_tx_hash.substring(0, 20)}...`
    );
    console.log(`     URL: ${CYAN}${agent.console_url}${RESET}\n`);
  });
}

async function displayStats(): Promise<void> {
  const stats = getStats();

  console.log(`${BOLD}📈 System Statistics${RESET}\n`);
  console.log(`  Total Agents: ${BOLD}${stats.total_agents}${RESET}`);
  console.log(`  Status Breakdown:`);
  console.log(
    `    ${GREEN}●${RESET} Running: ${stats.by_status.running} | ${YELLOW}●${RESET} Provisioning: ${stats.by_status.provisioning} | ${RED}●${RESET} Failed: ${stats.by_status.failed}`
  );
  console.log();
}

async function displayPricing(): Promise<void> {
  const cached = getCachedPrice();

  console.log(`${BOLD}💰 Price Cache${RESET}\n`);

  if (!cached) {
    console.log(DIM + '  No prices cached yet' + RESET);
    return;
  }

  const age = Math.floor((Date.now() - cached.timestamp) / 1000);
  const ageStr = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
  const sourceColor = cached.source === 'api' ? GREEN : cached.source === 'cache' ? CYAN : YELLOW;

  console.log(`  SOL: ${BOLD}$${cached.sol.toFixed(2)}${RESET} (${sourceColor}${cached.source}${RESET})`);
  console.log(`  HERD: ${BOLD}$${cached.herd.toFixed(4)}${RESET}`);
  console.log(`  Last Updated: ${DIM}${ageStr}${RESET}\n`);
}

async function displayServices(): Promise<void> {
  const services = await readServicesFromFile();
  const grouped = services.reduce(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    },
    {} as Record<string, typeof services>
  );

  console.log(`${BOLD}🛍️  Service Catalog (${services.length} services)${RESET}\n`);

  Object.entries(grouped).forEach(([category, items]) => {
    console.log(`  ${BOLD}${category.toUpperCase()}${RESET}`);
    items.forEach((s) => {
      console.log(
        `    • ${s.name}: ${GREEN}${s.price_sol} SOL${RESET} / ${s.price_herd} HERD`
      );
    });
    console.log();
  });
}

async function displayMenu(): Promise<void> {
  console.log(`${DIM}Commands:${RESET}`);
  console.log(`  ${CYAN}a${RESET} - Show all agents`);
  console.log(`  ${CYAN}s${RESET} - Show statistics`);
  console.log(`  ${CYAN}p${RESET} - Show pricing`);
  console.log(`  ${CYAN}c${RESET} - Show catalog`);
  console.log(`  ${CYAN}r${RESET} - Refresh all`);
  console.log(`  ${CYAN}q${RESET} - Quit\n`);
}

async function main(): Promise<void> {
  header('🚀 CLAWDROP MCP MONITOR');

  let running = true;

  while (running) {
    await displayAgents();
    await displayStats();
    await displayPricing();
    await displayServices();
    await displayMenu();

    console.log(`${DIM}Press a key to continue...${RESET}`);
    // In a real CLI, we'd use stdin. For now, just display.
    console.log(
      `\n${YELLOW}Monitor view ready. Run individual commands or use the test script.${RESET}\n`
    );
    break;
  }
}

main();
