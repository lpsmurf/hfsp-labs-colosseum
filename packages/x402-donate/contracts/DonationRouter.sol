// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * DonationRouter — x402 donation fee splitter.
 *
 * Donor sends USDC to this contract (payTo = this address).
 * The trusted router EOA calls route() which atomically splits:
 *   (100% - FEE_BPS) → charity's Endaoment contract
 *   FEE_BPS          → treasury
 *
 * Each txHash can only be routed once (replay protection).
 * If route() is never called, owner can rescue stuck funds.
 */
contract DonationRouter {
    IERC20  public immutable usdc;
    address public immutable treasury;
    address public immutable router;   // trusted EOA that calls route()
    uint256 public constant  FEE_BPS = 300; // 3%

    mapping(bytes32 => bool) public settled;

    event Routed(
        bytes32 indexed txHash,
        address indexed charity,
        uint256 charityAmount,
        uint256 fee
    );
    event Rescued(address indexed to, uint256 amount);

    error AlreadySettled();
    error OnlyRouter();
    error OnlyTreasury();
    error TransferFailed();

    modifier onlyRouter() {
        if (msg.sender != router) revert OnlyRouter();
        _;
    }

    constructor(address _usdc, address _treasury, address _router) {
        usdc     = IERC20(_usdc);
        treasury = _treasury;
        router   = _router;
    }

    /**
     * Split an incoming donation.
     * @param txHash   The Base tx hash where donor sent USDC to this contract.
     * @param charity  Endaoment contract address for the recipient org.
     * @param amount   USDC amount in 6-decimal units (same as seen in the tx).
     */
    function route(bytes32 txHash, address charity, uint256 amount) external onlyRouter {
        if (settled[txHash]) revert AlreadySettled();
        settled[txHash] = true;

        uint256 fee           = (amount * FEE_BPS) / 10_000;
        uint256 charityAmount = amount - fee;

        if (!usdc.transfer(charity, charityAmount)) revert TransferFailed();
        if (!usdc.transfer(treasury, fee))          revert TransferFailed();

        emit Routed(txHash, charity, charityAmount, fee);
    }

    /**
     * Emergency rescue — treasury can recover any USDC in the contract.
     * Intended for stuck funds from donors who never triggered route().
     */
    function rescue(address to, uint256 amount) external {
        if (msg.sender != treasury) revert OnlyTreasury();
        if (!usdc.transfer(to, amount)) revert TransferFailed();
        emit Rescued(to, amount);
    }

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
