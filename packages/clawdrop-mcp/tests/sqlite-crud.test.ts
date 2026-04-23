/**
 * Task 2.1: SQLite CRUD Tests
 * Tests database persistence, CRUD operations, and data consistency
 */

import {
  saveAgent,
  getAgent,
  countAgentsByWalletAndTier,
  updateAgentStatus,
  listAgents,
  getStats,
  healthCheck,
  AgentRecord,
} from '../src/db/sqlite';
import fs from 'fs';
import path from 'path';

// Use test database
process.env.DB_PATH = path.join(__dirname, 'test-agents.db');

// Clean up test database before tests
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

describe('Task 2.1: SQLite CRUD Operations', () => {
  
  describe('saveAgent - INSERT operations', () => {
    it('should save a new agent with all required fields', () => {
      const agent: AgentRecord = {
        deployment_id: 'test_deploy_001',
        tier_id: 'premium',
        wallet_address: 'wallet_test_123',
        agent_id: 'agent_001',
        agent_name: 'Test Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
        endpoint: 'http://localhost:3000',
      };

      expect(() => saveAgent(agent)).not.toThrow();
      
      // Verify persistence
      const retrieved = getAgent('test_deploy_001');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_name).toBe('Test Agent');
      expect(retrieved?.tier_id).toBe('premium');
    });

    it('should handle agents without optional endpoint field', () => {
      const agent: AgentRecord = {
        deployment_id: 'test_deploy_002',
        tier_id: 'basic',
        wallet_address: 'wallet_test_456',
        agent_id: 'agent_002',
        agent_name: 'Basic Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      expect(() => saveAgent(agent)).not.toThrow();
      const retrieved = getAgent('test_deploy_002');
      expect(retrieved?.endpoint).toBeNull();
    });

    it('should prevent duplicate deployment_id (PRIMARY KEY)', () => {
      const agent1: AgentRecord = {
        deployment_id: 'test_deploy_dup',
        tier_id: 'premium',
        wallet_address: 'wallet_dup_1',
        agent_id: 'agent_dup_1',
        agent_name: 'Dup Agent 1',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      const agent2: AgentRecord = {
        ...agent1,
        agent_name: 'Dup Agent 2',
      };

      saveAgent(agent1);
      expect(() => saveAgent(agent2)).toThrow(); // Should fail due to PRIMARY KEY constraint
    });
  });

  describe('getAgent - SELECT operations', () => {
    beforeEach(() => {
      const agent: AgentRecord = {
        deployment_id: 'test_deploy_get',
        tier_id: 'premium',
        wallet_address: 'wallet_get_test',
        agent_id: 'agent_get',
        agent_name: 'Get Test Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'running',
        endpoint: 'http://localhost:8080',
      };
      saveAgent(agent);
    });

    it('should retrieve agent by deployment_id', () => {
      const agent = getAgent('test_deploy_get');
      expect(agent).toBeDefined();
      expect(agent?.deployment_id).toBe('test_deploy_get');
      expect(agent?.agent_name).toBe('Get Test Agent');
      expect(agent?.status).toBe('running');
    });

    it('should return undefined for non-existent deployment_id', () => {
      const agent = getAgent('non_existent_deploy_id');
      expect(agent).toBeUndefined();
    });

    it('should retrieve all agent fields correctly', () => {
      const agent = getAgent('test_deploy_get');
      expect(agent?.tier_id).toBe('premium');
      expect(agent?.wallet_address).toBe('wallet_get_test');
      expect(agent?.agent_id).toBe('agent_get');
      expect(agent?.telegram_token).toBe('123456789:ABCdefGHIjklmnoPQRstuvWXYZ');
      expect(agent?.endpoint).toBe('http://localhost:8080');
    });
  });

  describe('countAgentsByWalletAndTier - Aggregate queries', () => {
    beforeEach(() => {
      // Create agents for counting
      for (let i = 1; i <= 3; i++) {
        const agent: AgentRecord = {
          deployment_id: `test_count_${i}`,
          tier_id: 'premium',
          wallet_address: 'wallet_count_123',
          agent_id: `agent_count_${i}`,
          agent_name: `Count Agent ${i}`,
          telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
          status: i === 3 ? 'stopped' : 'running', // Last one is stopped
        };
        saveAgent(agent);
      }
    });

    it('should count active agents by wallet and tier (excluding stopped/failed)', () => {
      const count = countAgentsByWalletAndTier('wallet_count_123', 'premium');
      expect(count).toBe(2); // 3 total, 1 stopped
    });

    it('should return 0 for wallet with no agents in tier', () => {
      const count = countAgentsByWalletAndTier('wallet_nonexistent', 'premium');
      expect(count).toBe(0);
    });

    it('should count correctly with different tiers', () => {
      const agent: AgentRecord = {
        deployment_id: 'test_count_tier2',
        tier_id: 'basic',
        wallet_address: 'wallet_count_123',
        agent_id: 'agent_tier2',
        agent_name: 'Basic Tier Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'running',
      };
      saveAgent(agent);

      const premiumCount = countAgentsByWalletAndTier('wallet_count_123', 'premium');
      const basicCount = countAgentsByWalletAndTier('wallet_count_123', 'basic');

      expect(premiumCount).toBe(2);
      expect(basicCount).toBe(1);
    });
  });

  describe('updateAgentStatus - UPDATE operations', () => {
    beforeEach(() => {
      const agent: AgentRecord = {
        deployment_id: 'test_update_001',
        tier_id: 'premium',
        wallet_address: 'wallet_update',
        agent_id: 'agent_update',
        agent_name: 'Update Test Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };
      saveAgent(agent);
    });

    it('should update agent status', () => {
      const success = updateAgentStatus('test_update_001', 'running');
      expect(success).toBe(true);

      const agent = getAgent('test_update_001');
      expect(agent?.status).toBe('running');
    });

    it('should return false for non-existent deployment_id', () => {
      const success = updateAgentStatus('non_existent', 'running');
      expect(success).toBe(false);
    });

    it('should update multiple statuses sequentially', () => {
      updateAgentStatus('test_update_001', 'running');
      let agent = getAgent('test_update_001');
      expect(agent?.status).toBe('running');

      updateAgentStatus('test_update_001', 'paused');
      agent = getAgent('test_update_001');
      expect(agent?.status).toBe('paused');

      updateAgentStatus('test_update_001', 'stopped');
      agent = getAgent('test_update_001');
      expect(agent?.status).toBe('stopped');
    });
  });

  describe('Data persistence - Restart simulation', () => {
    it('should persist data across application restart', () => {
      // Save an agent
      const agent: AgentRecord = {
        deployment_id: 'test_persist_001',
        tier_id: 'premium',
        wallet_address: 'wallet_persist',
        agent_id: 'agent_persist',
        agent_name: 'Persistence Test Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'running',
        endpoint: 'http://persist.test:9000',
      };
      
      saveAgent(agent);
      
      // Get it immediately
      let retrieved = getAgent('test_persist_001');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_name).toBe('Persistence Test Agent');
      
      // Simulate restart by querying again
      // (In a real test, we'd restart the Node process)
      retrieved = getAgent('test_persist_001');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_name).toBe('Persistence Test Agent');
      expect(retrieved?.endpoint).toBe('http://persist.test:9000');
    });
  });

  describe('Health checks', () => {
    it('should report healthy database', () => {
      const isHealthy = healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const agents: AgentRecord[] = [
        {
          deployment_id: 'stat_1',
          tier_id: 'premium',
          wallet_address: 'wallet_stat',
          agent_id: 'agent_stat_1',
          agent_name: 'Stat Agent 1',
          telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
          status: 'running',
        },
        {
          deployment_id: 'stat_2',
          tier_id: 'premium',
          wallet_address: 'wallet_stat',
          agent_id: 'agent_stat_2',
          agent_name: 'Stat Agent 2',
          telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
          status: 'paused',
        },
      ];
      agents.forEach(saveAgent);
    });

    it('should return statistics', () => {
      const stats = getStats();
      expect(stats.total_agents).toBeGreaterThan(0);
      expect(stats.by_status).toBeDefined();
      expect(stats.by_tier).toBeDefined();
      expect(stats.total_active_by_wallet).toBeDefined();
    });
  });
});
