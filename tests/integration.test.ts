import { handleToolCall } from '../src/server/tools';
import { readTiersFromFile } from '../src/services/tiers';
import { savePayment, getPayment, saveDeployment, getDeployment } from '../src/db/memory';
import { Payment } from '../src/models/payment';

describe('Clawdrop Integration Tests', () => {
  
  describe('list_tiers', () => {
    it('should return all tiers with capability bundles', async () => {
      const result = await handleToolCall('list_tiers', {});
      const parsed = JSON.parse(result);
      
      expect(parsed.tiers).toBeDefined();
      expect(parsed.tiers.length).toBeGreaterThan(0);
      expect(parsed.total_count).toBe(parsed.tiers.length);
      
      // Verify each tier has required fields
      parsed.tiers.forEach((tier: any) => {
        expect(tier.id).toBeDefined();
        expect(tier.name).toBeDefined();
        expect(tier.capability_bundle).toBeDefined();
        expect(tier.price_sol).toBeGreaterThan(0);
      });
    });
  });

  describe('quote_tier', () => {
    it('should quote a tier in SOL', async () => {
      const tiers = await readTiersFromFile();
      const tierID = tiers[0].id;
      
      const result = await handleToolCall('quote_tier', {
        tier_id: tierID,
        token: 'sol'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.tier_id).toBe(tierID);
      expect(parsed.price).toBeGreaterThan(0);
      expect(parsed.token).toBe('sol');
      expect(parsed.total_with_gas).toBe(parsed.price + (parsed.estimated_gas || 0));
      expect(parsed.valid_until).toBeDefined();
    });

    it('should quote a tier in HERD', async () => {
      const tiers = await readTiersFromFile();
      const tierID = tiers[0].id;
      
      const result = await handleToolCall('quote_tier', {
        tier_id: tierID,
        token: 'herd'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.token).toBe('herd');
      expect(parsed.price).toBeGreaterThan(0);
    });

    it('should return 404 for unknown tier', async () => {
      expect(async () => {
        await handleToolCall('quote_tier', {
          tier_id: 'unknown-tier-xyz',
          token: 'sol'
        });
      }).rejects.toThrow('Tier not found');
    });
  });

  describe('verify_payment', () => {
    it('should verify a payment with valid tx_hash', async () => {
      // Create a payment record first
      const payment: Payment = {
        payment_id: 'pay_test_001',
        wallet_address: 'test_wallet_xyz',
        tier_id: 'treasury-agent-pro',
        amount_sol: 8.5,
        token: 'sol',
        tx_hash: null,
        status: 'pending',
        confirmed_at: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      // Verify with mock tx_hash
      const result = await handleToolCall('verify_payment', {
        payment_id: 'pay_test_001',
        tx_hash: 'devnet_mock_hash_abc123def456'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.payment_id).toBe('pay_test_001');
      expect(parsed.verified).toBe(true);
      expect(parsed.tx_hash).toBe('devnet_mock_hash_abc123def456');
      expect(parsed.amount_sol).toBe(8.5);
      expect(parsed.status).toBe('confirmed');
      expect(parsed.explorer_url).toContain('solscan.io');
    });

    it('should fail to verify payment without tx_hash', async () => {
      const payment: Payment = {
        payment_id: 'pay_test_002',
        wallet_address: 'test_wallet_xyz',
        tier_id: 'treasury-agent-pro',
        amount_sol: 5.0,
        token: 'sol',
        tx_hash: null,
        status: 'pending',
        confirmed_at: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      const result = await handleToolCall('verify_payment', {
        payment_id: 'pay_test_002',
        tx_hash: ''
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.verified).toBe(false);
      expect(parsed.status).toBe('failed');
    });

    it('should return 404 for unknown payment', async () => {
      expect(async () => {
        await handleToolCall('verify_payment', {
          payment_id: 'pay_unknown_xyz',
          tx_hash: 'some_hash'
        });
      }).rejects.toThrow('Payment not found');
    });
  });

  describe('deploy_openclaw_instance', () => {
    it('should deploy an instance after verified payment', async () => {
      // Setup: Create verified payment
      const payment: Payment = {
        payment_id: 'pay_test_003',
        wallet_address: 'test_wallet_xyz',
        tier_id: 'treasury-agent-pro',
        amount_sol: 8.5,
        token: 'sol',
        tx_hash: 'devnet_hash_confirmed',
        status: 'confirmed',
        confirmed_at: new Date(),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      const result = await handleToolCall('deploy_openclaw_instance', {
        tier_id: 'treasury-agent-pro',
        payment_id: 'pay_test_003',
        agent_name: 'my-test-agent',
        wallet_address: 'test_wallet_xyz',
        region: 'us-east'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.deployment_id).toBeDefined();
      expect(parsed.agent_id).toBeDefined();
      expect(parsed.agent_name).toBe('my-test-agent');
      expect(parsed.status).toBe('provisioning');
      expect(parsed.console_url).toContain('clawdrop.live');
    });

    it('should fail if payment not confirmed', async () => {
      // Setup: Create unconfirmed payment
      const payment: Payment = {
        payment_id: 'pay_test_004',
        wallet_address: 'test_wallet_xyz',
        tier_id: 'treasury-agent-pro',
        amount_sol: 8.5,
        token: 'sol',
        tx_hash: null,
        status: 'pending',
        confirmed_at: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      expect(async () => {
        await handleToolCall('deploy_openclaw_instance', {
          tier_id: 'treasury-agent-pro',
          payment_id: 'pay_test_004',
          agent_name: 'my-test-agent',
          wallet_address: 'test_wallet_xyz'
        });
      }).rejects.toThrow('Payment not confirmed');
    });

    it('should fail for unknown tier', async () => {
      const payment: Payment = {
        payment_id: 'pay_test_005',
        wallet_address: 'test_wallet_xyz',
        tier_id: 'unknown-tier',
        amount_sol: 5.0,
        token: 'sol',
        tx_hash: 'devnet_hash',
        status: 'confirmed',
        confirmed_at: new Date(),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      expect(async () => {
        await handleToolCall('deploy_openclaw_instance', {
          tier_id: 'unknown-tier',
          payment_id: 'pay_test_005',
          agent_name: 'test',
          wallet_address: 'test_wallet_xyz'
        });
      }).rejects.toThrow('Tier not found');
    });
  });

  describe('get_deployment_status', () => {
    it('should return deployment status', async () => {
      // Setup: Create a deployment
      const payment: Payment = {
        payment_id: 'pay_test_006',
        wallet_address: 'test_wallet_xyz',
        tier_id: 'treasury-agent-pro',
        amount_sol: 8.5,
        token: 'sol',
        tx_hash: 'devnet_hash',
        status: 'confirmed',
        confirmed_at: new Date(),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      const deployResult = await handleToolCall('deploy_openclaw_instance', {
        tier_id: 'treasury-agent-pro',
        payment_id: 'pay_test_006',
        agent_name: 'status-test-agent',
        wallet_address: 'test_wallet_xyz'
      });
      const deployParsed = JSON.parse(deployResult);
      const deploymentID = deployParsed.deployment_id;
      
      // Check status
      const statusResult = await handleToolCall('get_deployment_status', {
        deployment_id: deploymentID
      });
      const statusParsed = JSON.parse(statusResult);
      
      expect(statusParsed.deployment_id).toBe(deploymentID);
      expect(statusParsed.agent_id).toBeDefined();
      expect(statusParsed.status).toBe('provisioning');
      expect(statusParsed.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(statusParsed.last_activity).toBeDefined();
      expect(statusParsed.logs).toBeDefined();
      expect(Array.isArray(statusParsed.logs)).toBe(true);
    });

    it('should return 404 for unknown deployment', async () => {
      expect(async () => {
        await handleToolCall('get_deployment_status', {
          deployment_id: 'deploy_unknown_xyz'
        });
      }).rejects.toThrow('Deployment not found');
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full flow: list → quote → verify → deploy → status', async () => {
      // 1. List tiers
      const tierListResult = await handleToolCall('list_tiers', {});
      const tiersParsed = JSON.parse(tierListResult);
      const tierID = tiersParsed.tiers[0].id;
      
      expect(tierID).toBeDefined();
      
      // 2. Quote tier
      const quoteResult = await handleToolCall('quote_tier', {
        tier_id: tierID,
        token: 'sol'
      });
      const quoteParsed = JSON.parse(quoteResult);
      expect(quoteParsed.price).toBeGreaterThan(0);
      
      // 3. Create and verify payment
      const payment: Payment = {
        payment_id: 'pay_e2e_flow',
        wallet_address: 'test_wallet_e2e',
        tier_id: tierID,
        amount_sol: quoteParsed.price,
        token: 'sol',
        tx_hash: null,
        status: 'pending',
        confirmed_at: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      const verifyResult = await handleToolCall('verify_payment', {
        payment_id: 'pay_e2e_flow',
        tx_hash: 'devnet_e2e_flow_hash'
      });
      const verifyParsed = JSON.parse(verifyResult);
      expect(verifyParsed.verified).toBe(true);
      
      // 4. Deploy instance
      const deployResult = await handleToolCall('deploy_openclaw_instance', {
        tier_id: tierID,
        payment_id: 'pay_e2e_flow',
        agent_name: 'e2e-test-agent',
        wallet_address: 'test_wallet_e2e'
      });
      const deployParsed = JSON.parse(deployResult);
      const deploymentID = deployParsed.deployment_id;
      expect(deploymentID).toBeDefined();
      
      // 5. Check status
      const statusResult = await handleToolCall('get_deployment_status', {
        deployment_id: deploymentID
      });
      const statusParsed = JSON.parse(statusResult);
      expect(statusParsed.status).toBe('provisioning');
      
      console.log('✅ End-to-end flow completed successfully');
    });
  });
});
