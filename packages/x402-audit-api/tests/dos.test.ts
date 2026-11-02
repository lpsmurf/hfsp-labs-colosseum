import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDos } from '../src/static/dos.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const file = { path: 'dos_vuln.sol', content: readFileSync(join(FIXTURES, 'dos_vuln.sol'), 'utf8') };
const dos = (src: string) => checkDos({ path: 'x.sol', content: src });

describe('SOL-DOS-002 — batch transfer with no failure isolation', () => {
  it('flags a queue drained by per-recipient transfer', () => {
    const f = checkDos(file).filter(x => x.id === 'SOL-DOS-002');
    expect(f.map(x => x.location)).toEqual(['dos_vuln.sol → Payouts.executeWithdraw()']);
  });

  // try/catch is the fix, so its presence means the author already considered
  // this and isolated the failure.
  it('stays silent when the call is wrapped in try/catch', () => {
    const flagged = checkDos(file).map(x => x.location).join(' ');
    expect(flagged.includes('executeIsolated')).toBe(true);   // still DOS-003
    expect(checkDos(file).some(x => x.id === 'SOL-DOS-002' && x.location.includes('executeIsolated')))
      .toBe(false);
  });

  it('catches a while loop, not only a for loop', () => {
    // The corpus case is a `while` — a queue drain is the shape most likely to
    // carry this bug and exactly what a for-only regex would miss.
    expect(dos(`contract C { function f() external {
      while (last > first) { token.safeTransfer(q[first].receiver, q[first].amount); first += 1; }
    } }`).map(x => x.id)).toEqual(['SOL-DOS-002']);
  });

  it('treats an ETH payout as a transfer but a batch executor as neither', () => {
    // `call{value: v}("")` sends ETH — the recommended way, and it carries the
    // same one-bad-recipient risk as `.transfer`.
    expect(dos(`contract C { function pay() external {
      for (uint256 i = 0; i < n; ++i) { (bool ok, ) = payable(to[i]).call{value: amt[i]}(""); require(ok); }
    } }`).map(x => x.id)).toEqual(['SOL-DOS-002']);

    // `call{value: v}(calldatas[i])` invokes a function. OpenZeppelin's
    // Governor._executeOperations runs a proposal this way and is deliberately
    // all-or-nothing: a half-executed proposal is worse than a reverted one.
    expect(dos(`contract C { function _executeOperations(address[] memory targets, uint256[] memory values, bytes[] memory calldatas) internal {
      for (uint256 i = 0; i < targets.length; ++i) {
        (bool success, bytes memory rd) = targets[i].call{value: values[i]}(calldatas[i]);
        Address.verifyCallResult(success, rd);
      }
    } }`)).toEqual([]);
  });

  // Found on the holdout half, where four of these were the engine's only
  // findings and all four were false.
  it('ignores a batch move to a single fixed recipient', () => {
    // benddao VaultLogic — one `to`, only the token id varying. Nobody is
    // behind anybody in that queue, so a failure inconveniences exactly the
    // caller who asked for it.
    expect(dos(`contract C { function erc721TransferOutLiquidity(address to, uint256[] memory tokenIds) internal {
      for (uint256 i = 0; i < tokenIds.length; i++) {
        IERC721(asset).safeTransferFrom(address(this), to, tokenIds[i]);
      }
    } }`)).toEqual([]);
  });

  it('flags a recipient bound from the array inside the loop', () => {
    // althea's distribute() and noya's executeWithdraw() are both written this
    // way — the recipient is a local assigned per iteration, so it carries no
    // index of its own to spot.
    expect(dos(`contract C { function distribute() public {
      for (uint i = 0; i < limit; i++) {
        address recipient = holders[i];
        toDistribute.transfer(recipient, entitlement);
      }
    } }`).map(x => x.id)).toEqual(['SOL-DOS-002']);
  });

  it('ignores a loop that moves no value', () => {
    expect(dos(`contract C { function f() external {
      for (uint256 i = 0; i < n; ++i) { total += weights[i]; }
    } }`)).toEqual([]);
  });
});

describe('SOL-DOS-003 — unbounded iteration over a caller-grown array', () => {
  it('flags a loop over an array an unguarded function pushes to', () => {
    const f = checkDos(file).filter(x => x.id === 'SOL-DOS-003');
    expect(f.map(x => x.location).sort()).toEqual([
      'dos_vuln.sol → Payouts.distribute()',
      'dos_vuln.sol → Payouts.executeIsolated()',
    ]);
  });

  it('does not fire when the push is guarded', () => {
    // The guard check is shared with the access-control engine, so every idiom
    // that counts there counts here.
    expect(dos(`contract C { address[] list;
      function add(address a) external onlyOwner { list.push(a); }
      function run() external { for (uint256 i = 0; i < list.length; ++i) { touch(list[i]); } }
    }`)).toEqual([]);
  });

  it('does not fire on a view function', () => {
    // The gas ceiling still applies to an on-chain caller, but the victim is
    // whoever chose to call it, and an off-chain reader can paginate.
    expect(dos(`contract C { address[] list;
      function add() external { list.push(msg.sender); }
      function count() external view returns (uint256 n) { for (uint256 i = 0; i < list.length; ++i) { n += 1; } }
    }`)).toEqual([]);
  });

  it('sees an array grown through a transfer hook', () => {
    // althea's LiquidInfrastructureERC20 grows `holders` in
    // _beforeTokenTransfer, which every ordinary transfer reaches. Solidity
    // calls the hook itself, so no caller names it and a direct-push check
    // misses it entirely — and the paid finding is precisely that the holders
    // array can be manipulated that way.
    expect(dos(`contract C { address[] holders;
      function _beforeTokenTransfer(address from, address to, uint256 amt) internal override {
        if (balanceOf(to) == 0) { holders.push(to); }
      }
      function distribute() external { for (uint256 i = 0; i < holders.length; ++i) { pay(holders[i]); } }
    }`).map(x => x.id)).toContain('SOL-DOS-003');
  });

  it('sees an array grown one call deep from an unguarded entry point', () => {
    expect(dos(`contract C { address[] list;
      function _add(address a) internal { list.push(a); }
      function join() external { _add(msg.sender); }
      function run() external { for (uint256 i = 0; i < list.length; ++i) { touch(list[i]); } }
    }`).map(x => x.id)).toContain('SOL-DOS-003');
  });

  it('does not fire on an array no external caller can grow', () => {
    expect(dos(`contract C { address[] list;
      function _add(address a) internal { list.push(a); }
      function run() external { for (uint256 i = 0; i < list.length; ++i) { touch(list[i]); } }
    }`)).toEqual([]);
  });

  it('names the array in the title so the finding is actionable', () => {
    const f = checkDos(file).find(x => x.id === 'SOL-DOS-003')!;
    expect(f.title).toContain('claimants');
    expect(f.refs).toContain('SWC-128');
  });
});
