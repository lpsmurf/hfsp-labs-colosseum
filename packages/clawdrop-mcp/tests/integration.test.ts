import { handleToolCall } from '../src/server/tools';
import { listTiers, getTier } from '../src/services/tier';
import { saveAgent, getAgent, updateAgentStatus, addAgentLog } from '../src/db/memory';
import type { DeployedAgent, PaymentRecord, Subscription } from '../src/db/memory';

describe('Clawdrop Integration Tests', () => {
  
  describe('list_tiers', () => {
    it('should return all tiers with pricing', async () => {
      const result = await handleToolCall('list_tiers', {});
      const parsed = JSON.parse(result);
      
      expect(parsed.tiers).toBeDefined();
      expect(parsed.tiers.length).toBeGreaterThan(0);
      
      // Verify each tier has required fields
      parsed.tiers.forEach((tier: any) => {
        expect(tier.tier_id).toBeDefined();
        expect(tier.name).toBeDefined();
        expect(tier.price_usd).toBeGreaterThan(0);
      });
    });
  });

  describe('quote_tier', () => {
    it('should quote a tier in SOL', async () => {
      const tiers = listTiers();
      const tierID = tiers[0].id;
      
      const result = await handleToolCall('quote_tier', {
        tier_id: tierID,
        payment_token: 'SOL'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.tier_id).toBe(tierID);
      expect(parsed.price_in_token).toBeGreaterThan(0);
      expect(parsed.payment_token).toBe('SOL');
      expect(parsed.fee_usd).toBeDefined();
      expect(parsed.quote_expires_at).toBeDefined();
    });

    it('should quote a tier in HERD (skipped in CI - requires Jupiter API)', async () => {
      // Skip if no network access (CI environment)
      if (process.env.CI || process.env.NODE_ENV === 'test') {
        console.log('Skipping HERD quote test - requires Jupiter API access');
        return;
      }
      
      const tiers = listTiers();
      const tierID = tiers[0].id;
      
      const result = await handleToolCall('quote_tier', {
        tier_id: tierID,
        payment_token: 'HERD'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.tier_id).toBe(tierID);
      expect(parsed.payment_token).toBe('HERD');
    });
  });

  describe('Agent lifecycle', () => {
    it('should create and retrieve an agent', async () => {
      const now = new Date();
      const agent: DeployedAgent = {
        agent_id: 'test_agent_001',
        tier_id: 'tier_a',
        agent_name: 'Test Agent',
        owner_wallet: 'test_wallet_123',
        bundles: ['solana', 'research'],
        status: 'provisioning',
        console_url: 'https://test.example.com',
        deployed_at: now,
        last_activity: now,
        subscription: {
          tier_id: 'tier_a',
          amount_usd: 29,
          payment_token: 'SOL',
          started_at: now,
          next_payment_due: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          grace_period_end: null,
          payment_history: [{
            payment_id: 'pay_test_001',
            amount: 0.2,
            token: 'SOL',
            tx_hash: 'test_hash_123',
            timestamp: now,
            fee_charged_usd: 1,
            jupiter_swap: false
          }]
        },
        logs: [{
          timestamp: now,
          level: 'info',
          message: 'Test deployment'
        }]
      };
      
      saveAgent(agent);
      
      const retrieved = getAgent('test_agent_001');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_id).toBe('test_agent_001');
      expect(retrieved?.status).toBe('provisioning');
    });

    it('should update agent status', async () => {
      const now = new Date();
      const agent: DeployedAgent = {
        agent_id: 'test_agent_002',
        tier_id: 'tier_b',
        agent_name: 'Status Test Agent',
        owner_wallet: 'wallet_status',
        bundles: ['solana'],
        status: 'provisioning',
        console_url: 'https://test2.example.com',
        deployed_at: now,
        last_activity: now,
        subscription: {
          tier_id: 'tier_b',
          amount_usd: 99,
          payment_token: 'SOL',
          started_at: now,
          next_payment_due: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          grace_period_end: null,
          payment_history: []
        },
        logs: []
      };
      
      saveAgent(agent);
      
      // Update status
      const updated = updateAgentStatus('test_agent_002', 'running');
      expect(updated).toBe(true);
      
      const retrieved = getAgent('test_agent_002');
      expect(retrieved?.status).toBe('running');
    });

    it('should add agent logs', async () => {
      const now = new Date();
      const agent: DeployedAgent = {
        agent_id: 'test_agent_003',
        tier_id: 'tier_c',
        agent_name: 'Log Test Agent',
        owner_wallet: 'wallet_logs',
        bundles: ['treasury'],
        status: 'running',
        console_url: 'https://test3.example.com',
        deployed_at: now,
        last_activity: now,
        subscription: {
          tier_id: 'tier_c',
          amount_usd: 299,
          payment_token: 'SOL',
          started_at: now,
          next_payment_due: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          grace_period_end: null,
          payment_history: []
        },
        logs: []
      };
      
      saveAgent(agent);
      
      // Add log
      const added = addAgentLog('test_agent_003', 'info', 'Test log message');
      expect(added).toBe(true);
      
      const retrieved = getAgent('test_agent_003');
      expect(retrieved?.logs.length).toBe(1);
      expect(retrieved?.logs[0].message).toBe('Test log message');
    });
  });

  describe('Error Handling', () => {
    describe('quote_tier - errors', () => {
      it('should return error for non-existent tier', async () => {
        await expect(
          handleToolCall('quote_tier', { tier_id: 'non-existent-tier', payment_token: 'SOL' })
        ).rejects.toThrow();
      });
    });

    describe('get_deployment_status - errors', () => {
      it('should return error when agent not found', async () => {
        await expect(
          handleToolCall('get_deployment_status', { agent_id: 'non-existent', owner_wallet: 'test' })
        ).rejects.toThrow();
      });
    });

    describe('cancel_subscription - errors', () => {
      it('should require confirm flag', async () => {
        await expect(
          handleToolCall('cancel_subscription', { 
            agent_id: 'non-existent', 
            owner_wallet: 'test',
            confirm: false 
          })
        ).rejects.toThrow();
      });
    });
  });

  describe('Birdeye Tools', () => {
    it('should get token analytics', async () => {
      const result = await handleToolCall('get_token_analytics', {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.mint).toBeDefined();
      expect(parsed.symbol).toBeDefined();
      expect(parsed.price_usd).toBeGreaterThanOrEqual(0);
    });

    it('should get market overview', async () => {
      try {
        const result = await handleToolCall('get_market_overview', {});
        const parsed = JSON.parse(result);
        
        expect(parsed.tokens).toBeDefined();
        expect(Array.isArray(parsed.tokens)).toBe(true);
        expect(parsed.count).toBeGreaterThanOrEqual(0);
      } catch (err: any) {
        // API may be unauthorized in test env - that's OK
        if (err.message?.includes('Unauthorized') || err.message?.includes('401')) {
          console.log('Skipping market overview test - Birdeye API unauthorized');
          return;
        }
        throw err;
      }
    });
  });

  describe('Risk Policy Tools', () => {
    it('should check token risk', async () => {
      const result = await handleToolCall('check_token_risk', {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        action: 'swap',
        amount: 100
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.decision).toMatch(/allowed|warned|blocked/);
      expect(parsed.risk_tier).toMatch(/GREEN|YELLOW|RED/);
      expect(parsed.summary).toBeDefined();
    });

    it('should allow whitelisted tokens', async () => {
      const result = await handleToolCall('check_token_risk', {
        mint: 'So11111111111111111111111111111111111111112', // SOL
        action: 'swap',
        amount: 1000
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.decision).toBe('allowed');
      expect(parsed.risk_tier).toBe('GREEN');
    });
  });
});