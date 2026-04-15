import { handleToolCall } from '../src/server/tools';
import { readTiersFromFile } from '../src/services/tiers';
import { saveDeployment, getDeployment, savePayment, getPayment, updatePaymentStatus, addDeploymentLog } from '../src/db/memory';
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
      
      expect(parsed.tier_id).toBe(tierID);
      expect(parsed.token).toBe('herd');
    });
  });

  describe('verify_payment', () => {
    it('should verify a payment with valid tx_hash', async () => {
      const payment: Payment = {
        payment_id: 'pay_test_001',
        wallet_address: 'test_wallet_123',
        tier_id: 'treasury-agent',
        amount_sol: 5.0,
        amount_herd: 0,
        token: 'sol',
        tx_hash: null,
        status: 'pending',
        confirmed_at: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
      
      savePayment(payment);
      
      const result = await handleToolCall('verify_payment', {
        payment_id: 'pay_test_001',
        tx_hash: 'test_hash_123'
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.verified).toBe(true);
      expect(parsed.status).toBe('confirmed');
    });
  });

  describe('deploy_openclaw_instance', () => {
    it('should create a deployment', async () => {
      // First create a confirmed payment
      const paymentID = 'pay_deploy_test';
      const payment: Payment = {
        payment_id: paymentID,
        wallet_address: 'wallet_deploy',
        tier_id: 'treasury-agent',
        amount_sol: 5.0,
        amount_herd: 0,
        token: 'sol',
        tx_hash: 'hash_123',
        status: 'confirmed',
        confirmed_at: new Date(),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
      };
      savePayment(payment);
      updatePaymentStatus(paymentID, 'confirmed', 'hash_123');

      const result = await handleToolCall('deploy_openclaw_instance', {
        tier_id: 'treasury-agent',
        payment_id: paymentID,
        agent_name: 'test-agent',
        wallet_address: 'wallet_deploy',
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.deployment_id).toBeDefined();
      expect(parsed.agent_id).toBeDefined();
      expect(parsed.status).toBe('provisioning');
    });
  });

  describe('get_deployment_status', () => {
    it('should return deployment status', async () => {
      // Create a deployment first
      const paymentID = 'pay_status_test';
      const payment: Payment = {
        payment_id: paymentID,
        wallet_address: 'wallet_status',
        tier_id: 'treasury-agent',
        amount_sol: 5.0,
        amount_herd: 0,
        token: 'sol',
        tx_hash: 'hash_456',
        status: 'confirmed',
        confirmed_at: new Date(),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
      };
      savePayment(payment);
      updatePaymentStatus(paymentID, 'confirmed', 'hash_456');

      const deployResult = await handleToolCall('deploy_openclaw_instance', {
        tier_id: 'treasury-agent',
        payment_id: paymentID,
        agent_name: 'status-test-agent',
        wallet_address: 'wallet_status',
      });
      const deployed = JSON.parse(deployResult);

      const result = await handleToolCall('get_deployment_status', {
        deployment_id: deployed.deployment_id,
      });
      const parsed = JSON.parse(result);
      
      expect(parsed.deployment_id).toBe(deployed.deployment_id);
      expect(parsed.status).toBe('provisioning');
      expect(parsed.uptime_seconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    describe('quote_tier - errors', () => {
      it('should return error for non-existent tier', async () => {
        expect(async () => {
          await handleToolCall('quote_tier', { tier_id: 'non-existent-tier', token: 'sol' });
        }).rejects.toThrow('Tier not found');
      });
    });

    describe('verify_payment - errors', () => {
      it('should return error when payment not found', async () => {
        expect(async () => {
          await handleToolCall('verify_payment', { payment_id: 'non-existent', tx_hash: 'hash123' });
        }).rejects.toThrow('Payment not found');
      });
    });

    describe('deploy_openclaw_instance - errors', () => {
      it('should return error when payment not found', async () => {
        expect(async () => {
          await handleToolCall('deploy_openclaw_instance', {
            tier_id: 'treasury-agent',
            payment_id: 'non-existent',
            agent_name: 'test',
            wallet_address: 'wallet123',
          });
        }).rejects.toThrow('Payment not found');
      });
    });

    describe('get_deployment_status - errors', () => {
      it('should return error when deployment not found', async () => {
        expect(async () => {
          await handleToolCall('get_deployment_status', { deployment_id: 'non-existent' });
        }).rejects.toThrow('Deployment not found');
      });
    });
  });
});
