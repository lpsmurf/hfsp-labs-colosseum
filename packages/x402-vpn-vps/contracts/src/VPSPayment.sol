// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract VPSPayment is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Period { HOUR, DAY, WEEK }
    enum Region { DE_FSN, DE_NBG, FI_HEL, PL_WAW, US_ASH, US_HIL, SG_SIN }

    uint256 public constant PRICE_HOUR =   250_000; // $0.25 USDC (6 decimals)
    uint256 public constant PRICE_DAY  =   790_000; // $0.79 USDC
    uint256 public constant PRICE_WEEK = 3_990_000; // $3.99 USDC

    IERC20     public immutable usdc;
    ISemaphore public immutable semaphore;
    uint256    public immutable groupId;

    event ServerRequested(Period indexed period, Region indexed region, uint256 timestamp);

    constructor(address _usdc, address _semaphore, uint256 _groupId, address _owner)
        Ownable(_owner)
    {
        usdc      = IERC20(_usdc);
        semaphore = ISemaphore(_semaphore);
        groupId   = _groupId;
    }

    function pay(uint256 identityCommitment, Period period, Region region) external nonReentrant {
        uint256 price;
        if      (period == Period.HOUR) price = PRICE_HOUR;
        else if (period == Period.DAY)  price = PRICE_DAY;
        else                            price = PRICE_WEEK;

        usdc.safeTransferFrom(msg.sender, address(this), price);
        semaphore.addMember(groupId, identityCommitment);
        emit ServerRequested(period, region, block.timestamp);
    }

    // Called by the operator backend after verifying a Solana USDC payment (Option A).
    // Funds stay on Solana — this only adds the identity to the Semaphore group on Base.
    function addMemberSolana(uint256 identityCommitment, Period period, Region region) external onlyOwner {
        semaphore.addMember(groupId, identityCommitment);
        emit ServerRequested(period, region, block.timestamp);
    }

    function withdraw(address to) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        usdc.safeTransfer(to, bal);
    }
}
