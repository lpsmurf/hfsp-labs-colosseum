// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSemaphore {
    event MemberAdded(uint256 groupId, uint256 identityCommitment);
    function addMember(uint256 groupId, uint256 identityCommitment) external {
        emit MemberAdded(groupId, identityCommitment);
    }
}
