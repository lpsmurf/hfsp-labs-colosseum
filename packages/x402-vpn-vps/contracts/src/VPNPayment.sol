// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract VPNPayment is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Period { HOUR, DAY, WEEK, MONTH }

    uint256 public constant PRICE_HOUR  =   200_000; // $0.20 USDC (6 decimals)
    uint256 public constant PRICE_DAY   =   790_000; // $0.79 USDC
    uint256 public constant PRICE_WEEK  = 2_990_000; // $2.99 USDC
    uint256 public constant PRICE_MONTH = 7_990_000; // $7.99 USDC

    IERC20     public immutable usdc;
    ISemaphore public immutable semaphore;
    uint256    public immutable groupId;

    event AccessPurchased(Period indexed period, uint256 timestamp);

    constructor(address _usdc, address _semaphore, uint256 _groupId, address _owner)
        Ownable(_owner)
    {
        usdc      = IERC20(_usdc);
        semaphore = ISemaphore(_semaphore);
        groupId   = _groupId;
    }

    function pay(uint256 identityCommitment, Period period) external nonReentrant {
        uint256 price;
        if      (period == Period.HOUR)  price = PRICE_HOUR;
        else if (period == Period.DAY)   price = PRICE_DAY;
        else if (period == Period.WEEK)  price = PRICE_WEEK;
        else                             price = PRICE_MONTH;

        usdc.safeTransferFrom(msg.sender, address(this), price);
        semaphore.addMember(groupId, identityCommitment);
        emit AccessPurchased(period, block.timestamp);
    }

    // Called by the operator backend after verifying a Solana USDC payment (Option A).
    // Funds stay on Solana — this only adds the identity to the Semaphore group on Base.
    function addMemberSolana(uint256 identityCommitment, Period period) external onlyOwner {
        semaphore.addMember(groupId, identityCommitment);
        emit AccessPurchased(period, block.timestamp);
    }

    function withdraw(address to) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        usdc.safeTransfer(to, bal);
    }
}
