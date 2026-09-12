pragma solidity 0.8.26;

// The same four functions, each guarded by a different idiom. All four idioms
// are in real use, and a guard checker that only recognises OpenZeppelin's
// accuses correct contracts — which is exactly what SOL-PROXY-001 did to
// UniswapV2Pair before it was rewritten.
contract FeeSplitter {
    address[] public curves;
    uint256 public feeBps;
    address public treasury;
    bool public paused;
    address public owner;
    address public governance;
    mapping(address => bool) public operators;
    mapping(address => uint256) public deposits;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // Modifier.
    function setCurves(address[] calldata newCurves) external onlyOwner {
        curves = newCurves;
    }

    // Inline caller check.
    function updateFeeBps(uint256 bps) external {
        require(msg.sender == governance, "not gov");
        feeBps = bps;
    }

    // Custom-error form, which is what post-0.8.4 code actually writes.
    function sweepTokens(address token) external {
        if (msg.sender != treasury) revert Unauthorized();
        IERC20(token).transfer(treasury, IERC20(token).balanceOf(address(this)));
    }

    // Role mapping.
    function pause() external {
        require(operators[msg.sender], "not operator");
        paused = true;
    }

    // Still permissionless, still correct. Present so the inventory has one
    // genuinely open function to count in a file where everything else is
    // guarded — a guard checker that reports 5 of 5 guarded here is broken.
    function deposit(uint256 amount) external {
        deposits[msg.sender] += amount;
    }
}
