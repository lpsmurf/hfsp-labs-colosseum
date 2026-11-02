import { describe, it, expect } from 'vitest';
import { analyzeStatic } from '../src/static/index.js';

// Guard for a bug we have now written twice, hours apart, from the same cause.
//
// `\b` is a boundary between a word character and a non-word character, and `_`
// counts as a word character. So `\bnonce` does not match `_useNonce`, and
// `\bslot` does not match `EIP1967_ADMIN_SLOT`. Both shipped:
//
//   - SOL-SIG-002 used /\bnonce/ and therefore accused OpenZeppelin's
//     ERC20Permit.permit() and all of ERC-3009 of having no replay protection,
//     because their nonce is spelled `_useNonce`.
//   - STATIC-SECRET-004's hash-context check used /\bslot/ and therefore
//     reported aave's `EIP1967_ADMIN_SLOT` as a CRITICAL leaked private key.
//
// Any rule that matches an identifier must survive every spelling convention a
// real codebase uses. These tests assert the same code in camelCase, snake_case,
// SCREAMING_SNAKE and a leading-underscore private form behaves identically.

const SPELLINGS = (base: string) => {
  const camel  = base.replace(/_(\w)/g, (_, c) => c.toUpperCase());
  const pascal = camel[0].toUpperCase() + camel.slice(1);
  return {
    snake:           base,
    camel,
    screaming:       base.toUpperCase(),
    leadingUnderscore: `_${camel}`,
    prefixed:        `_use${pascal}`,
    suffixed:        `stored_${base}`,
  };
};

describe('identifier-matching rules survive every spelling', () => {
  // A nonce present in any spelling must suppress SOL-SIG-002.
  for (const [style, name] of Object.entries(SPELLINGS('nonce'))) {
    it(`SOL-SIG-002 recognises a nonce spelled ${style} (${name})`, async () => {
      const src = `
        pragma solidity 0.8.26;
        contract C {
          mapping(address => uint256) public ${name};
          function claim(bytes32 h, uint8 v, bytes32 r, bytes32 s, uint256 deadline) external {
            require(block.timestamp <= deadline, "expired");
            address signer = ECDSA.recover(_hashTypedDataV4(h), v, r, s);
            require(${name}[signer]++ == 0, "replay");
            balances[signer] += 1;
          }
        }`;
      const { findings } = await analyzeStatic([{ path: 'C.sol', content: src }]);
      expect(
        findings.filter(f => f.id === 'SOL-SIG-002'),
        `a nonce spelled "${name}" should suppress the replay finding`,
      ).toEqual([]);
    });
  }

  // A 32-byte hex constant named as a slot/hash must never be a "leaked key",
  // in any spelling.
  const SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
  for (const [style, name] of Object.entries(SPELLINGS('admin_slot'))) {
    it(`STATIC-SECRET-004 ignores a slot constant spelled ${style} (${name})`, async () => {
      const src = `export const ${name} = '${SLOT}';\n`;
      const { findings } = await analyzeStatic([{ path: 'helpers.ts', content: src }]);
      expect(
        findings.filter(f => f.id === 'STATIC-SECRET-004'),
        `"${name}" names a storage slot, not a credential`,
      ).toEqual([]);
    });
  }

  // The inverse must still hold: a value named as a key is still reported.
  for (const [style, name] of Object.entries(SPELLINGS('private_key'))) {
    it(`STATIC-SECRET-004 still reports a key spelled ${style} (${name})`, async () => {
      const src = `const ${name} = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";\n`;
      const { findings } = await analyzeStatic([{ path: 'config.ts', content: src }]);
      const hit = findings.find(f => f.id === 'STATIC-SECRET-004');
      expect(hit, `"${name}" is a credential and must be reported`).toBeDefined();
      expect(hit!.confidence).toBe('HIGH');
    });
  }
});

describe('no rule regex relies on \\b against an underscore', () => {
  it('documents the trap for the next reader', () => {
    // Executable documentation. If this ever fails, JavaScript changed, not us.
    //
    // Both real rules are case-insensitive, so the `i` flag is part of the
    // comparison — `\b` is the only difference being demonstrated here. Without
    // it the assertion tests casing instead, which is a different bug.
    expect(/\bnonce/i.test('_useNonce')).toBe(false);
    expect(/\bslot/i.test('EIP1967_ADMIN_SLOT')).toBe(false);
    // The fix in both cases was to drop the leading \b.
    expect(/nonce/i.test('_useNonce')).toBe(true);
    expect(/slot/i.test('EIP1967_ADMIN_SLOT')).toBe(true);
  });
});
