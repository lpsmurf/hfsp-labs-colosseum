pragma solidity 0.8.26;

// The shape of the derive-half finding: a balance debited inside `unchecked`
// with nothing upstream establishing that it covered the amount.
contract Dex {
    mapping(address => mapping(address => uint256)) public balances;
    uint256 public totalSupply;
    uint256 public reserve;

    // SOL-MATH-001 — the wrap makes this a mint, not a revert.
    function withdraw(address token, uint256 amount) external {
        unchecked {
            balances[msg.sender][token] -= amount;
        }
        IERC20(token).transfer(msg.sender, amount);
    }

    // SOL-MATH-001 — same defect in assignment form.
    function burn(uint256 amount) external {
        unchecked {
            totalSupply = totalSupply - amount;
        }
    }

    // Must NOT fire: the bound is established one line earlier.
    function withdrawChecked(address token, uint256 amount) external {
        require(balances[msg.sender][token] >= amount, "insufficient");
        unchecked {
            balances[msg.sender][token] -= amount;
        }
    }

    // Must NOT fire: a loop counter is the most common thing inside unchecked
    // and cannot underflow past the loop condition.
    function total(address[] calldata users, address token) external view returns (uint256 sum) {
        for (uint256 i = 0; i < users.length; ) {
            sum += balances[users[i]][token];
            unchecked { ++i; }
        }
    }

    // Must NOT fire: addition. You cannot accumulate 2^256 of anything, and
    // flagging this would fire on every gas-optimised contract in existence.
    function credit(address token, uint256 amount) external {
        unchecked {
            balances[msg.sender][token] += amount;
        }
    }

    // Must NOT fire: clamped rather than compared.
    function drawDown(uint256 amount) external {
        uint256 take = Math.min(amount, reserve);
        unchecked {
            reserve -= take;
        }
    }
}
