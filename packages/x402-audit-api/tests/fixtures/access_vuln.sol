pragma solidity 0.8.26;

// Four unguarded administrative functions, one per rule plus one that must NOT
// fire. Modelled on the fee-splitter finding from the derive half, where
// setCurves() was external with nothing in front of it.
contract FeeSplitter {
    address[] public curves;
    uint256 public feeBps;
    address public treasury;
    bool public paused;
    mapping(address => uint256) public deposits;

    // SOL-AC-001 — anyone can redirect the entire fee stream.
    function setCurves(address[] calldata newCurves) external {
        curves = newCurves;
    }

    // SOL-AC-001 again, different contract member.
    function updateFeeBps(uint256 bps) external {
        feeBps = bps;
    }

    // SOL-AC-002 — sweeps a balance to a caller-chosen destination.
    function sweepTokens(address token, address to) external {
        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }

    // SOL-AC-003 — a griefing brake, not a theft.
    function pause() external {
        paused = true;
    }

    // Permissionless by design. A rule that fires here is a rule nobody can
    // ship: this is what most external functions in DeFi look like.
    function deposit(uint256 amount) external {
        deposits[msg.sender] += amount;
    }

    // Guarded by a modifier the file does not define. We cannot resolve it, so
    // it counts as a guard — inventing a CRITICAL out of an unfamiliar modifier
    // is the failure mode this engine is built to avoid.
    function setTreasury(address t) external onlyGovernor {
        treasury = t;
    }

    // A view function has no surface to guard.
    function currentFee() external view returns (uint256) {
        return feeBps;
    }
}
