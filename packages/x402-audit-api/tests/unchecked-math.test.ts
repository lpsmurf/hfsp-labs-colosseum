import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUncheckedMath } from '../src/static/unchecked-math.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const file = { path: 'unchecked_vuln.sol', content: readFileSync(join(FIXTURES, 'unchecked_vuln.sol'), 'utf8') };

describe('SOL-MATH-001', () => {
  // The negative cases matter more than the positive ones here. `unchecked` is
  // ubiquitous in gas-optimised Solidity, so a rule that fires on the common
  // safe uses is unusable no matter how many real bugs it also catches.
  it('flags only the two unbounded subtractions', () => {
    const findings = checkUncheckedMath(file);
    expect(findings.map(f => f.location).sort()).toEqual([
      'unchecked_vuln.sol → burn()',
      'unchecked_vuln.sol → withdraw()',
    ]);
  });

  it('stays silent on a loop counter, on addition, on a require-bounded debit and on a clamp', () => {
    const flagged = checkUncheckedMath(file).map(f => f.location).join(' ');
    for (const fn of ['total', 'credit', 'withdrawChecked', 'drawDown']) {
      expect(flagged.includes(`${fn}()`), `${fn}() was flagged`).toBe(false);
    }
  });

  it('accepts a bound written against an indexed mapping', () => {
    // `require(balances[msg.sender][token] >= amount)` — the operator follows
    // the index chain, not the identifier. An earlier version of the guard
    // regex expected the bare name and missed every mapping balance check.
    const findings = checkUncheckedMath({
      path: 'x.sol',
      content: `contract C { mapping(address=>uint256) b;
        function f(uint256 a) external {
          require(b[msg.sender] >= a, "no");
          unchecked { b[msg.sender] -= a; }
        } }`,
    });
    expect(findings).toEqual([]);
  });

  // Measured against solmate, where this was the engine's only finding and it
  // was false. The idiom is in solmate, OpenZeppelin and most tokens written
  // since 0.8, so a rule that cannot see it fires on nearly every ERC-20.
  it('accepts a bound established by an earlier checked subtraction', () => {
    expect(checkUncheckedMath({
      path: 'ERC20.sol',
      content: `contract C { mapping(address=>uint256) balanceOf; uint256 totalSupply;
        function _burn(address from, uint256 amount) internal virtual {
          balanceOf[from] -= amount;
          // Cannot underflow: a balance is never larger than the supply.
          unchecked { totalSupply -= amount; }
        } }`,
    })).toEqual([]);
  });

  it('does nothing on a file with no unchecked block', () => {
    expect(checkUncheckedMath({ path: 'y.sol', content: 'contract C { function f() external { x -= 1; } }' }))
      .toEqual([]);
  });

  it('names the offending expression so the finding is checkable', () => {
    const f = checkUncheckedMath(file).find(x => x.location.includes('withdraw()'))!;
    expect(f.detail).toContain('-=');
    expect(f.severity).toBe('HIGH');
    expect(f.confidence).toBe('MEDIUM');
    expect(f.refs).toContain('SWC-101');
  });
});
