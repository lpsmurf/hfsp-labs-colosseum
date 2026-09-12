import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAccessControl,
  accessControlInventory,
  guardOf,
} from '../src/static/access-control.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(name: string) {
  return { path: name, content: readFileSync(join(FIXTURES, name), 'utf8') };
}

// The engine is exercised directly rather than through analyzeStatic. Running
// the whole pipeline over these fixtures also fires SOL-ERC20-001 and friends,
// and a test that has to subtract other engines' findings stops telling you
// which rule regressed.
describe('access-control rules', () => {
  it('flags exactly the four unguarded administrative functions', () => {
    const findings = checkAccessControl(load('access_vuln.sol'));

    expect(findings.map(f => `${f.id} ${f.location.split('→ ')[1]}`).sort()).toEqual([
      'SOL-AC-001 FeeSplitter.setCurves()',
      'SOL-AC-001 FeeSplitter.updateFeeBps()',
      'SOL-AC-002 FeeSplitter.sweepTokens()',
      'SOL-AC-003 FeeSplitter.pause()',
    ]);
  });

  it('does not flag deposit(), a view, or a function with an unknown modifier', () => {
    const flagged = checkAccessControl(load('access_vuln.sol')).map(f => f.location);
    for (const fn of ['deposit', 'currentFee', 'setTreasury']) {
      expect(flagged.some(l => l.includes(fn)), `${fn} was flagged`).toBe(false);
    }
  });

  // The half that carries the value. Four different guard idioms, all real,
  // none of them OpenZeppelin's modifier.
  it('is silent once every function is guarded', () => {
    expect(checkAccessControl(load('access_fixed.sol'))).toEqual([]);
  });

  it('carries a confidence, a location and a fix on every finding', () => {
    for (const f of checkAccessControl(load('access_vuln.sol'))) {
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(f.confidence);
      expect(f.location).toMatch(/→ \w+\.\w+\(\)$/);
      expect(f.fix.length).toBeGreaterThan(20);
    }
  });
});

describe('guardOf', () => {
  // A modifier we cannot resolve must count as a guard. SOL-PROXY-001 accused
  // UniswapV2Pair and UniswapV3Pool of unprotected initializers by assuming the
  // opposite, and both were correctly guarded.
  it('treats an unfamiliar modifier as a guard', () => {
    expect(guardOf('function f(uint256 x) external onlyGovernor ', '{}')).toBe('onlyGovernor');
  });

  // Reentrancy and pause modifiers restrict when, never who. Counting them
  // would hide the exact bug this engine exists to find.
  it('does not treat nonReentrant or whenNotPaused as access control', () => {
    expect(guardOf('function f() external nonReentrant whenNotPaused ', '{ x = 1; }')).toBeNull();
  });

  // `returns (address owner)` sits in the modifier slot and names a parameter
  // that looks exactly like a guard.
  it('ignores the returns clause and the parameter list', () => {
    expect(guardOf('function f(address onlyOwnerCandidate) external returns (address admin) ', '{ x = 1; }'))
      .toBeNull();
  });

  it('recognises a bare role lookup but not a balance comparison', () => {
    expect(guardOf('function f() external ', '{ require(operators[msg.sender], "no"); }')).toBeTruthy();
    expect(guardOf('function f(uint256 a) external ', '{ require(balance[msg.sender] >= a, "no"); }')).toBeNull();
  });

  it('recognises the custom-error form', () => {
    expect(guardOf('function f() external ', '{ if (msg.sender != owner) revert Unauthorized(); }'))
      .toBeTruthy();
  });
});

// Every case here was a false positive produced on real, repeatedly-audited
// code before it was fixed. 32 findings across OpenZeppelin, Uniswap v2/v3,
// solmate and aave — all 32 false. The measurement came before the claim, and
// these lock the result in.
describe('false positives measured on audited protocols', () => {
  const ac = (src: string) => checkAccessControl({ path: 'x.sol', content: src });

  it('accepts a caller compared through a local alias', () => {
    // OpenZeppelin AccessManaged.setAuthority and TimelockController.updateDelay.
    // The comparison never mentions msg.sender, so a guard check looking for
    // `msg.sender ==` reports both as unguarded HIGHs.
    expect(ac(`contract C { address public authority;
      function setAuthority(address a) public virtual {
        address caller = _msgSender();
        if (caller != authority) { revert Unauthorized(caller); }
        authority = a;
      } }`)).toEqual([]);
  });

  it('accepts a setter that writes only the caller-keyed record', () => {
    // ERC721/ERC1155 setApprovalForAll, ERC6909 setOperator, aave
    // Pool.setUserEMode and setUserUseReserveAsCollateral. The caller is the
    // subject: there is no third party whose state a guard would protect.
    expect(ac(`contract C { mapping(address => mapping(address => bool)) public isApprovedForAll;
      function setApprovalForAll(address operator, bool approved) public virtual {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
      } }`)).toEqual([]);
  });

  it('still flags a global setter that merely logs the caller', () => {
    // The mirror of the case above, and the reason `emit` is stripped before
    // the caller-scope test. Suppressing on any mention of msg.sender would
    // silence every genuine finding in a contract that logs who called.
    const f = ac(`contract C { uint256 public feeBps;
      function setFeeBps(uint256 bps) external {
        feeBps = bps;
        emit FeeChanged(msg.sender, bps);
      } }`);
    expect(f.map(x => x.id)).toEqual(['SOL-AC-001']);
  });

  it('accepts a wrapper that forwards to its own overload', () => {
    // aave L2Pool — a calldata-compression shim over the inherited Pool
    // function. Whatever guard the callee has, this inherits; single-file
    // analysis cannot see it, so reporting the wrapper reports the absence of
    // evidence rather than a defect.
    expect(ac(`contract L2Pool {
      function setUserUseReserveAsCollateral(bytes32 args) external override {
        (address asset, bool use) = CalldataLogic.decode(args);
        setUserUseReserveAsCollateral(asset, use);
      } }`)).toEqual([]);
  });

  it('does not treat an AMM skim as an admin sweep', () => {
    // UniswapV2Pair.skim() takes only the surplus above the recorded reserves
    // and is permissionless in v2 and every fork of it.
    expect(ac(`contract P { uint112 reserve0;
      function skim(address to) external lock {
        _safeTransfer(token0, to, IERC20(token0).balanceOf(address(this)) - reserve0);
      } }`)).toEqual([]);
  });
});

describe('attack-surface inventory', () => {
  it('counts guarded and unguarded external state-changing functions', () => {
    const s = accessControlInventory([load('access_fixed.sol')]);

    // Five external state-changing functions; four guarded, deposit() open.
    // A checker reporting 5 of 5 guarded is the failure this asserts against.
    expect(s.total).toBe(5);
    expect(s.guarded).toBe(4);
    expect(s.unguarded).toBe(1);
    expect(s.open.map(f => f.fn)).toEqual(['deposit']);
    expect(s.truncated).toBe(false);

    // deposit() keys off msg.sender, so being open is correct by construction.
    // That distinction is the whole value of the table: a protocol can have
    // forty open functions and be entirely right.
    expect(s.open[0].scope).toBe('caller');
    expect(s.unguardedGlobal).toBe(0);
  });

  it('excludes view functions — Solidity already guarantees they write nothing', () => {
    const s = accessControlInventory([load('access_vuln.sol')]);
    expect(s.open.map(f => f.fn)).not.toContain('currentFee');
    expect(s.total).toBe(6);           // currentFee() excluded
    expect(s.unguarded).toBe(5);       // everything but setTreasury()
    expect(s.unguardedGlobal).toBe(4); // deposit() is caller-scoped
  });

  it('reports nothing for a non-Solidity file', () => {
    const s = accessControlInventory([{ path: 'app.ts', content: 'export function setFee() {}' }]);
    expect(s.total).toBe(0);
  });
});
