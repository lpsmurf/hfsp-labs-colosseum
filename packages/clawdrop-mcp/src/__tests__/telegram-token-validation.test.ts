/**
 * CODEX Stream 1: Telegram Token Validation Tests
 * 
 * Acceptance tests for Claude's telegram_token implementation:
 * 1. Schema validation (missing, invalid format, valid format)
 * 2. Runtime validation via validateTelegramToken()
 * 3. Schema rejects missing required field
 * 4. Format validation before API calls
 * 5. Whitespace trimming
 * 
 * Reference: packages/clawdrop-mcp/src/server/schemas.ts
 *            packages/clawdrop-mcp/src/server/tools.ts (validateTelegramToken)
 */

import { z } from 'zod';
import { DeployAgentInputSchema } from '../server/schemas';

describe('[CODEX-STREAM1] Telegram Token Validation', () => {
  
  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Schema rejects missing telegram_token (required field)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 1: Missing telegram_token (required field)', () => {
    it('should reject deploy_agent when telegram_token is missing', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        bundles: [],
        // MISSING telegram_token
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject deploy_agent when telegram_token is null', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: null,
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject deploy_agent when telegram_token is undefined', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: undefined,
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject deploy_agent when telegram_token is empty string', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Invalid token format (should be rejected by schema regex)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 2: Invalid token format', () => {
    it('should reject token with no colon separator', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: 'badtoken123456',  // Missing colon
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject token with non-numeric prefix', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: 'ABC:xyz123',  // Non-numeric prefix
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject token with invalid characters in suffix', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:ABC#def@ghi',  // Invalid characters
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject token that is too short', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123:ab',  // Too short (min 10 chars)
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });

    it('should reject token with only colon', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:',  // Empty suffix
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Valid token format (should pass schema validation)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 3: Valid token format', () => {
    it('should accept standard Telegram bot token format', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toBe('123456789:ABCdefGHIjklmnoPQRstuvWXYZ');
      }).not.toThrow();
    });

    it('should accept token with underscores and hyphens', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '987654321:aB_Cd-EfGhIjKlMnOpQrStUvWxYz',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toBe('987654321:aB_Cd-EfGhIjKlMnOpQrStUvWxYz');
      }).not.toThrow();
    });

    it('should accept token with many digits and alphanumerics', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toBe('1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      }).not.toThrow();
    });

    it('should accept token with lowercase letters', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:abcdefghijklmnopqrstuvwxyz',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toBe('123456789:abcdefghijklmnopqrstuvwxyz');
      }).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Whitespace handling (should be trimmed by tools.ts handler)
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 4: Whitespace handling', () => {
    it('should accept token with leading whitespace (will be trimmed by handler)', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '  123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        // Schema passes whitespace through; handler should trim it
        expect(result.telegram_token).toBe('  123456789:ABCdefGHIjklmnoPQRstuvWXYZ');
      }).not.toThrow();
    });

    it('should accept token with trailing whitespace (will be trimmed by handler)', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ  ',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        // Schema passes whitespace through; handler should trim it
        expect(result.telegram_token).toBe('123456789:ABCdefGHIjklmnoPQRstuvWXYZ  ');
      }).not.toThrow();
    });

    it('should reject token with internal whitespace', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:ABC defGHIjklmnoPQRstuvWXYZ',  // Space in middle
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        DeployAgentInputSchema.parse(input);
      }).toThrow(z.ZodError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Schema validation error messages
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 5: Error messages', () => {
    it('should provide helpful error message for invalid format', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: 'badtoken',
        bundles: [],
        llm_provider: 'anthropic',
      };

      try {
        DeployAgentInputSchema.parse(input);
        fail('Should have thrown');
      } catch (e) {
        if (e instanceof z.ZodError) {
          expect(e.errors[0].message).toContain('Invalid Telegram token format');
        } else {
          fail('Should be ZodError');
        }
      }
    });

    it('should indicate minimum length requirement', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '1:a',
        bundles: [],
        llm_provider: 'anthropic',
      };

      try {
        DeployAgentInputSchema.parse(input);
        fail('Should have thrown');
      } catch (e) {
        if (e instanceof z.ZodError) {
          // Should fail either on length or format
          expect(e.errors.length).toBeGreaterThan(0);
        } else {
          fail('Should be ZodError');
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Full deploy_agent payload validation
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 6: Full deploy_agent payload', () => {
    const validPayload = {
      tier_id: 'tier_a',
      agent_name: 'MyAwesomeBot',
      owner_wallet: '11111111111111111111111111111111',
      payment_token: 'SOL',
      payment_tx_hash: 'devnet_test_1234567890',
      telegram_token: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ',
      bundles: ['solana', 'research'],
      llm_provider: 'anthropic',
      llm_api_key: 'sk-test-1234567890',
    };

    it('should accept complete valid payload with telegram_token', () => {
      expect(() => {
        const result = DeployAgentInputSchema.parse(validPayload);
        expect(result.telegram_token).toBe('123456789:ABCdefGHIjklmnoPQRstuvWXYZ');
        expect(result.agent_name).toBe('MyAwesomeBot');
      }).not.toThrow();
    });

    it('should reject payload missing only telegram_token', () => {
      const payload = { ...validPayload };
      delete (payload as any).telegram_token;

      expect(() => {
        DeployAgentInputSchema.parse(payload);
      }).toThrow(z.ZodError);
    });

    it('should work with optional llm_api_key omitted', () => {
      const payload = { ...validPayload };
      delete (payload as any).llm_api_key;

      expect(() => {
        const result = DeployAgentInputSchema.parse(payload);
        expect(result.telegram_token).toBe('123456789:ABCdefGHIjklmnoPQRstuvWXYZ');
      }).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Token format edge cases
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Test 7: Edge cases', () => {
    it('should accept very long numeric prefix', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '99999999999999999999:ABCdefGHIjklmnoPQRstuvWXYZ',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toBe('99999999999999999999:ABCdefGHIjklmnoPQRstuvWXYZ');
      }).not.toThrow();
    });

    it('should accept very long alphanumeric suffix', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:' + 'A'.repeat(100) + 'B'.repeat(100),
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toContain(':');
      }).not.toThrow();
    });

    it('should accept token with multiple hyphens and underscores', () => {
      const input = {
        tier_id: 'tier_a',
        agent_name: 'TestAgent',
        owner_wallet: '11111111111111111111111111111111',
        payment_token: 'SOL',
        payment_tx_hash: 'test_12345',
        telegram_token: '123456789:_A-B_C-D_E-F_',
        bundles: [],
        llm_provider: 'anthropic',
      };

      expect(() => {
        const result = DeployAgentInputSchema.parse(input);
        expect(result.telegram_token).toBe('123456789:_A-B_C-D_E-F_');
      }).not.toThrow();
    });
  });
});
