// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TestUSD
 * @notice 测试用稳定币 — 无权限 faucet，任何人可以自由 mint
 *         仅用于 Base Sepolia 测试网，不上主网
 */
contract TestUSD {
    string public constant name     = "Test USD";
    string public constant symbol   = "USDB";
    uint8  public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ── ERC20 ──────────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // ── Faucet: 公开 mint，每次最多 $10000 ─────────────────────────────────

    function faucet(address to, uint256 amount) external {
        require(amount <= 10_000 * 10**6, "Too much");
        _mint(to, amount);
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "zero from");
        require(to   != address(0), "zero to");
        require(balanceOf[from] >= amount, "insufficient");
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to]   += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "zero to");
        totalSupply      += amount;
        balanceOf[to]    += amount;
        emit Transfer(address(0), to, amount);
    }
}
