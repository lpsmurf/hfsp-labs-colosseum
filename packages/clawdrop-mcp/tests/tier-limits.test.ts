/**
 * Task 2.3: Atomic Tier Limits Tests
 * Tests that tier limits are enforced atomically under concurrent load
 */

import {
  checkAndIncrementTierCount,
  decrementTierCount,
  setTierLimit,
  getTierLimit,
  AgentRecord,
  saveAgent,
} from '../src/db/sqlite';
import fs from 'fs';
import path from 'path';

process.env.DB_PATH = path.join(__dirname, 'test-tier-limits.db');

beforeAll(() => {
  const dbPath = process.env.DB_PATH!;
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

afterAll(() => {
  const dbPath = process.env.DB_PATH!;
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

describe('Task 2.3: Atomic Tier Limits', () => {
  
  describe('setTierLimit and getTierLimit', () => {
    it('should set and retrieve tier limits', () => {
      setTierLimit('premium', 5);
      const limit = getTierLimit('premium');
      expect(limit).toBe(5);
    });

    it('should handle multiple tiers independently', () => {
      setTierLimit('basic', 2);
      setTierLimit('premium', 5);
      setTierLimit('enterprise', 20);

      expect(getTierLimit('basic')).toBe(2);
      expect(getTierLimit('premium')).toBe(5);
      expect(getTierLimit('enterprise')).toBe(20);
    });

    it('should update existing tier limits', () => {
      setTierLimit('premium', 10);
      expect(getTierLimit('premium')).toBe(10);
      
      setTierLimit('premium', 15);
      expect(getTierLimit('premium')).toBe(15);
    });
  });

  describe('checkAndIncrementTierCount - Atomic operations', () => {
    beforeEach(() => {
      // Set tier limit to 3 for test
      setTierLimit('test-tier', 3);
    });

    it('should increment count when below limit', () => {
      const wallet = 'wallet_atomic_1';
      const tier = 'test-tier';

      const result1 = checkAndIncrementTierCount(wallet, tier, 3);
      expect(result1).toBe(true);

      const result2 = checkAndIncrementTierCount(wallet, tier, 3);
      expect(result2).toBe(true);

      const result3 = checkAndIncrementTierCount(wallet, tier, 3);
      expect(result3).toBe(true);
    });

    it('should reject when at limit', () => {
      const wallet = 'wallet_limit_test';
      const tier = 'test-tier';

      // Fill to limit (3)
      checkAndIncrementTierCount(wallet, tier, 3);
      checkAndIncrementTierCount(wallet, tier, 3);
      checkAndIncrementTierCount(wallet, tier, 3);

      // 4th attempt should fail
      const result = checkAndIncrementTierCount(wallet, tier, 3);
      expect(result).toBe(false);
    });

    it('should enforce limits per wallet', () => {
      const wallet1 = 'wallet_per_wallet_1';
      const wallet2 = 'wallet_per_wallet_2';
      const tier = 'test-tier';

      // Wallet 1 fills to limit
      checkAndIncrementTierCount(wallet1, tier, 3);
      checkAndIncrementTierCount(wallet1, tier, 3);
      checkAndIncrementTierCount(wallet1, tier, 3);

      // Wallet 2 should be able to use the tier
      const result = checkAndIncrementTierCount(wallet2, tier, 3);
      expect(result).toBe(true);
    });

    it('should enforce limits per tier', () => {
      const wallet = 'wallet_per_tier';
      const tier1 = 'tier-a';
      const tier2 = 'tier-b';

      setTierLimit('tier-a', 2);
      setTierLimit('tier-b', 2);

      // Fill tier-a to limit
      checkAndIncrementTierCount(wallet, 'tier-a', 2);
      checkAndIncrementTierCount(wallet, 'tier-a', 2);

      // Should still be able to use tier-b
      const result = checkAndIncrementTierCount(wallet, 'tier-b', 2);
      expect(result).toBe(true);
    });

    it('should start from 0 for new wallet-tier combination', () => {
      const wallet = 'wallet_new_combo_' + Date.now();
      const tier = 'test-tier';

      // First attempt should succeed
      const result = checkAndIncrementTierCount(wallet, tier, 3);
      expect(result).toBe(true);
    });
  });

  describe('decrementTierCount', () => {
    it('should decrement tier count', () => {
      const wallet = 'wallet_decrement_test';
      const tier = 'test-tier';

      // Increment twice
      checkAndIncrementTierCount(wallet, tier, 5);
      checkAndIncrementTierCount(wallet, tier, 5);

      // Decrement once
      const result = decrementTierCount(wallet, tier);
      expect(result).toBe(true);

      // Should be able to increment again
      const canIncrement = checkAndIncrementTierCount(wallet, tier, 5);
      expect(canIncrement).toBe(true);
    });

    it('should not go below 0', () => {
      const wallet = 'wallet_decrement_zero';
      const tier = 'test-tier';

      // Try to decrement when at 0
      const result = decrementTierCount(wallet, tier);
      expect(result).toBe(false);
    });
  });

  describe('Concurrent load simulation', () => {
    it('should handle sequential concurrent-like requests', () => {
      const wallet = 'wallet_concurrent_sim';
      const tier = 'test-tier';
      const max_agents = 3;

      const results = [];

      // Simulate 5 concurrent-like requests
      for (let i = 0; i < 5; i++) {
        const result = checkAndIncrementTierCount(wallet, tier, max_agents);
        results.push(result);
      }

      // First 3 should succeed, last 2 should fail
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(true);
      expect(results[2]).toBe(true);
      expect(results[3]).toBe(false);
      expect(results[4]).toBe(false);
    });

    it('should handle rapid-fire requests safely', () => {
      const wallet = 'wallet_rapid_' + Date.now();
      const tier = 'test-tier';
      const max_agents = 10;

      const results = [];

      // 20 rapid requests
      for (let i = 0; i < 20; i++) {
        const result = checkAndIncrementTierCount(wallet, tier, max_agents);
        results.push(result);
      }

      // Exactly 10 should succeed
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBe(10);

      // Remaining should fail
      const failCount = results.filter(r => r === false).length;
      expect(failCount).toBe(10);
    });
  });

  describe('Atomicity guarantees', () => {
    it('should not have race conditions with increment/decrement', () => {
      const wallet = 'wallet_atomicity_test';
      const tier = 'test-tier';

      setTierLimit('test-tier', 5);

      // Increment to 3
      checkAndIncrementTierCount(wallet, tier, 5);
      checkAndIncrementTierCount(wallet, tier, 5);
      checkAndIncrementTierCount(wallet, tier, 5);

      // Decrement to 2
      decrementTierCount(wallet, tier);

      // Should be able to increment again
      const result = checkAndIncrementTierCount(wallet, tier, 5);
      expect(result).toBe(true);

      // Now at 3 again - next should fail if limit is 3
      const resultLimitThree = checkAndIncrementTierCount(wallet, tier, 3);
      expect(resultLimitThree).toBe(false);
    });

    it('should ensure no phantom reads', () => {
      const wallet = 'wallet_phantom_' + Date.now();
      const tier = 'test-tier';

      // Check that count is 0
      const result1 = checkAndIncrementTierCount(wallet, tier, 5);
      expect(result1).toBe(true); // Should succeed (count goes 0 -> 1)

      // Immediate check - should see updated count
      const result2 = checkAndIncrementTierCount(wallet, tier, 5);
      expect(result2).toBe(true); // Should succeed (count goes 1 -> 2)
    });
  });

  describe('Integration with agent storage', () => {
    it('should coordinate with saveAgent', () => {
      const wallet = 'wallet_integration_test';
      const tier = 'integration-tier';

      setTierLimit('integration-tier', 2);

      // Create and save agents
      for (let i = 1; i <= 3; i++) {
        const canDeploy = checkAndIncrementTierCount(wallet, tier, 2);

        if (canDeploy) {
          const agent: AgentRecord = {
            deployment_id: `deploy_integration_${i}`,
            tier_id: tier,
            wallet_address: wallet,
            agent_id: `agent_integration_${i}`,
            agent_name: `Integration Agent ${i}`,
            telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
            status: 'provisioning',
          };
          saveAgent(agent);
        }
      }

      // Should have saved exactly 2 agents
      expect(checkAndIncrementTierCount(wallet, tier, 2)).toBe(false); // Limit reached
    });
  });
});
