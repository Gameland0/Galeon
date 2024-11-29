// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Airdrop {
    IERC20 public token; // 代币合约地址
    address public owner; // 合约拥有者

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }

    constructor(address _token) {
        token = IERC20(_token);
        owner = msg.sender; // 部署合约的地址为拥有者
    }

    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Mismatched array lengths");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            
            // 转移代币到接收者
            token.transfer(recipients[i], amounts[i]);
        }
    }
}
