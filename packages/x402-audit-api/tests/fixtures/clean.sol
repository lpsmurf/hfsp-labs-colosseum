pragma solidity 0.8.26;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SafeVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    mapping(address => uint256) public balance;
    mapping(address => uint256) public nonces;
    address public owner;
    IERC20 public token;

    function withdraw(uint256 amount) external nonReentrant {
        require(balance[msg.sender] >= amount, "no funds");
        balance[msg.sender] -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "send failed");
    }

    function setOwner(address newOwner) external {
        require(newOwner != address(0), "zero");
        owner = newOwner;
    }

    function pay(address to, uint256 amt) external {
        token.safeTransfer(to, amt);
    }

    function claim(bytes32 digest, bytes calldata sig, uint256 deadline) external {
        require(block.timestamp <= deadline, "expired");
        address signer = ECDSA.recover(_hashTypedDataV4(digest), sig);
        require(nonces[signer]++ == 0, "replay");
        balance[signer] += 1;
    }
}
