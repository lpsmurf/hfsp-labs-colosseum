/**
 * Task 2.2: Idempotency Keys Tests
 * Tests that same idempotency_key always returns same deployment_id (no duplicates)
 */

import {
  saveAgent,
  getAgent,
  getAgentByIdempotencyKey,
  generateIdempotencyKey,
  AgentRecord,
} from '../src/db/sqlite';
import fs from 'fs';
import path from 'path';

process.env.DB_PATH = path.join(__dirname, 'test-idempotency.db');

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

describe('Task 2.2: Idempotency Keys', () => {
  
  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same params', () => {
      const params = {
        wallet_address: 'wallet_test_123',
        tier_id: 'premium',
        agent_name: 'Test Agent',
      };

      const key1 = generateIdempotencyKey(params);
      const key2 = generateIdempotencyKey(params);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different params', () => {
      const params1 = {
        wallet_address: 'wallet_test_123',
        tier_id: 'premium',
        agent_name: 'Agent 1',
      };

      const params2 = {
        wallet_address: 'wallet_test_123',
        tier_id: 'premium',
        agent_name: 'Agent 2',
      };

      const key1 = generateIdempotencyKey(params1);
      const key2 = generateIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different wallets', () => {
      const params1 = {
        wallet_address: 'wallet_aaa',
        tier_id: 'premium',
        agent_name: 'Agent',
      };

      const params2 = {
        wallet_address: 'wallet_bbb',
        tier_id: 'premium',
        agent_name: 'Agent',
      };

      const key1 = generateIdempotencyKey(params1);
      const key2 = generateIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it('should generate 32-char hex strings', () => {
      const key = generateIdempotencyKey({
        wallet_address: 'test',
        tier_id: 'premium',
        agent_name: 'Agent',
      });

      expect(key).toMatch(/^[a-f0-9]{32}$/);
      expect(key.length).toBe(32);
    });
  });

  describe('getAgentByIdempotencyKey', () => {
    it('should retrieve agent by idempotency key', () => {
      const idempotencyKey = generateIdempotencyKey({
        wallet_address: 'wallet_idem_001',
        tier_id: 'premium',
        agent_name: 'Idem Agent 1',
      });

      const agent: AgentRecord = {
        deployment_id: 'deploy_idem_001',
        idempotency_key: idempotencyKey,
        tier_id: 'premium',
        wallet_address: 'wallet_idem_001',
        agent_id: 'agent_idem_001',
        agent_name: 'Idem Agent 1',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      saveAgent(agent);

      const retrieved = getAgentByIdempotencyKey(idempotencyKey);
      expect(retrieved).toBeDefined();
      expect(retrieved?.deployment_id).toBe('deploy_idem_001');
    });

    it('should return undefined for non-existent idempotency key', () => {
      const retrieved = getAgentByIdempotencyKey('non_existent_key');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Idempotency - Same key returns same deployment_id', () => {
    it('should prevent duplicate deployments from retry', () => {
      const idempotencyKey = generateIdempotencyKey({
        wallet_address: 'wallet_retry_test',
        tier_id: 'premium',
        agent_name: 'Retry Test Agent',
      });

      // First request - save agent
      const agent: AgentRecord = {
        deployment_id: 'deploy_retry_001',
        idempotency_key: idempotencyKey,
        tier_id: 'premium',
        wallet_address: 'wallet_retry_test',
        agent_id: 'agent_retry_001',
        agent_name: 'Retry Test Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      saveAgent(agent);

      // Simulate retry with same idempotency key
      const existingAgent = getAgentByIdempotencyKey(idempotencyKey);
      expect(existingAgent).toBeDefined();
      expect(existingAgent?.deployment_id).toBe('deploy_retry_001');

      // Application should return existing deployment_id, not create new one
      // (This is application logic, not DB logic)
    });

    it('should handle multiple retries with same key', () => {
      const idempotencyKey = generateIdempotencyKey({
        wallet_address: 'wallet_multi_retry',
        tier_id: 'basic',
        agent_name: 'Multi Retry Agent',
      });

      const agent: AgentRecord = {
        deployment_id: 'deploy_multi_retry',
        idempotency_key: idempotencyKey,
        tier_id: 'basic',
        wallet_address: 'wallet_multi_retry',
        agent_id: 'agent_multi_retry',
        agent_name: 'Multi Retry Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      saveAgent(agent);

      // Simulate 5 retries
      for (let i = 0; i < 5; i++) {
        const result = getAgentByIdempotencyKey(idempotencyKey);
        expect(result?.deployment_id).toBe('deploy_multi_retry');
      }
    });

    it('should distinguish between different agents', () => {
      const params1 = {
        wallet_address: 'wallet_distinct_1',
        tier_id: 'premium',
        agent_name: 'Agent 1',
      };

      const params2 = {
        wallet_address: 'wallet_distinct_2',
        tier_id: 'premium',
        agent_name: 'Agent 2',
      };

      const key1 = generateIdempotencyKey(params1);
      const key2 = generateIdempotencyKey(params2);

      const agent1: AgentRecord = {
        deployment_id: 'deploy_distinct_1',
        idempotency_key: key1,
        tier_id: 'premium',
        wallet_address: 'wallet_distinct_1',
        agent_id: 'agent_distinct_1',
        agent_name: 'Agent 1',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      const agent2: AgentRecord = {
        deployment_id: 'deploy_distinct_2',
        idempotency_key: key2,
        tier_id: 'premium',
        wallet_address: 'wallet_distinct_2',
        agent_id: 'agent_distinct_2',
        agent_name: 'Agent 2',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      saveAgent(agent1);
      saveAgent(agent2);

      const retrieved1 = getAgentByIdempotencyKey(key1);
      const retrieved2 = getAgentByIdempotencyKey(key2);

      expect(retrieved1?.deployment_id).toBe('deploy_distinct_1');
      expect(retrieved2?.deployment_id).toBe('deploy_distinct_2');
      expect(retrieved1?.deployment_id).not.toBe(retrieved2?.deployment_id);
    });
  });

  describe('Idempotency UNIQUE constraint', () => {
    it('should prevent duplicate idempotency keys', () => {
      const idempotencyKey = generateIdempotencyKey({
        wallet_address: 'wallet_dup_key',
        tier_id: 'premium',
        agent_name: 'Dup Key Agent',
      });

      const agent1: AgentRecord = {
        deployment_id: 'deploy_dup_key_1',
        idempotency_key: idempotencyKey,
        tier_id: 'premium',
        wallet_address: 'wallet_dup_key',
        agent_id: 'agent_dup_key_1',
        agent_name: 'Dup Key Agent',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      const agent2: AgentRecord = {
        deployment_id: 'deploy_dup_key_2',
        idempotency_key: idempotencyKey,
        tier_id: 'premium',
        wallet_address: 'wallet_dup_key',
        agent_id: 'agent_dup_key_2',
        agent_name: 'Dup Key Agent 2',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        status: 'provisioning',
      };

      saveAgent(agent1);
      expect(() => saveAgent(agent2)).toThrow(); // Should fail due to UNIQUE constraint
    });
  });
});
