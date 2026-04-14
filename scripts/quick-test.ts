/**
 * Quick test: Call MCP tools directly
 */

import { handleToolCall } from '../src/server/tools';

async function test() {
  console.log('Testing Clawdrop MCP Tools...\n');

  try {
    // Test 1: List services
    console.log('1️⃣  Listing services...');
    const listResult = await handleToolCall('list_services', {});
    const listData = JSON.parse(listResult);
    console.log(`   Found ${listData.total_count} services`);
    console.log(`   Example: ${listData.services[0].name} (${listData.services[0].price_sol} SOL)\n`);

    // Test 2: Quote a service
    console.log('2️⃣  Quoting Treasury Agent in SOL...');
    const quoteResult = await handleToolCall('quote_service', {
      service_id: 'treasury-agent',
      token: 'sol',
    });
    const quoteData = JSON.parse(quoteResult);
    console.log(`   Price: ${quoteData.price} SOL`);
    console.log(`   Gas: ${quoteData.estimated_gas} SOL`);
    console.log(`   Total: ${quoteData.total_with_gas} SOL\n`);

    // Test 3: Process payment
    console.log('3️⃣  Processing payment...');
    const payResult = await handleToolCall('pay_with_sol', {
      service_id: 'treasury-agent',
      amount_sol: 5.0,
      wallet_pubkey: '8xDWbVyBPCL3dqAg9YEZNqDQxEjgAGHYRvRN5fKqjVB2',
      approve: true,
    });
    const payData = JSON.parse(payResult);
    console.log(`   Transaction: ${payData.tx_hash}`);
    console.log(`   Status: ${payData.status}\n`);

    // Test 4: Create agent
    console.log('4️⃣  Creating agent...');
    const agentResult = await handleToolCall('create_openclaw_agent', {
      service_id: 'treasury-agent',
      agent_name: 'My Treasury Agent',
      agent_description: 'Manages crypto treasury',
    });
    const agentData = JSON.parse(agentResult);
    console.log(`   Agent ID: ${agentData.agent_id}`);
    console.log(`   Status: ${agentData.status}`);
    console.log(`   URL: ${agentData.console_url}\n`);

    // Test 5: Check status
    console.log('5️⃣  Checking agent status...');
    const statusResult = await handleToolCall('get_agent_status', {
      agent_id: agentData.agent_id,
    });
    const statusData = JSON.parse(statusResult);
    console.log(`   Status: ${statusData.status}`);
    console.log(`   Uptime: ${statusData.uptime_seconds}s`);
    console.log(`   Logs: ${statusData.logs?.length || 0} entries\n`);

    console.log('✅ All tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();
