pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vault {
    mapping(address => uint256) public balance;
    address public owner;
    uint256 public nonceUnused;
    IERC20 public token;

    function withdraw(uint256 amount) external {
        require(balance[msg.sender] >= amount, "no funds");
        payable(msg.sender).transfer(amount);
        balance[msg.sender] -= amount;
    }

    function adminOnly() external {
        require(tx.origin == owner, "not owner");
    }

    function claim(bytes32 h, uint8 v, bytes32 r, bytes32 s) external {
        address signer = ecrecover(h, v, r, s);
        balance[signer] += 1;
    }

    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    function pay(address to, uint256 amt) external {
        token.transfer(to, amt);
    }

    function lottery() external view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
    }

    function priceOf() external view returns (uint256) {
        (uint112 r0, uint112 r1, ) = pair.getReserves();
        return uint256(r1) / uint256(r0);
    }

    function initialize(address o) external {
        owner = o;
    }

    function nuke() external {
        selfdestruct(payable(owner));
    }
}
