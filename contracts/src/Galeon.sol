// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Galeon is ERC20 {

    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 10 ** 18;

    constructor() ERC20("Galeon", "GALEON") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
