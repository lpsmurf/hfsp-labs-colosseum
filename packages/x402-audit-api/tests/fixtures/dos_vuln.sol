pragma solidity 0.8.26;

// Modelled on noya's AccountingManager.executeWithdraw, where a queue is
// drained in a `while` loop that safeTransfers to each recipient in turn.
contract Payouts {
    struct Request { address receiver; uint256 amount; }
    mapping(uint256 => Request) public queue;
    address[] public claimants;
    uint256 public first;
    uint256 public last;
    IERC20 public baseToken;

    // SOL-DOS-002 — one blacklisted receiver at the head blocks everyone
    // behind it, permanently.
    function executeWithdraw(uint256 maxIterations) public {
        uint256 i = 0;
        while (last > first && i < maxIterations) {
            Request memory data = queue[first];
            baseToken.safeTransfer(data.receiver, data.amount);
            delete queue[first];
            first += 1;
            i += 1;
        }
    }

    // SOL-DOS-003 — register() is unguarded and pushes, so claimants can be
    // grown until this loop no longer fits in a block.
    function distribute() external {
        for (uint256 i = 0; i < claimants.length; ++i) {
            balances[claimants[i]] += 1;
        }
    }

    function register() external {
        claimants.push(msg.sender);
    }

    // Must NOT fire: the per-recipient failure is caught, which is the fix.
    function executeIsolated() external {
        for (uint256 i = 0; i < claimants.length; ++i) {
            try baseToken.transfer(claimants[i], 1) {} catch { failed[claimants[i]] = true; }
        }
    }

    // Must NOT fire: a loop that moves no value.
    function tally() external view returns (uint256 n) {
        for (uint256 i = 0; i < claimants.length; ++i) {
            n += balances[claimants[i]];
        }
    }
}
