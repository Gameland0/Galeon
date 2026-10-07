// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SimpleMultiSig
 * @notice 简易2/3多签钱包 — 用于测试Owner权限管理
 */
contract SimpleMultiSig {
    address[3] public owners;
    uint256 public constant REQUIRED = 2; // 2/3签名

    struct Transaction {
        address to;
        bytes data;
        uint256 value;
        bool executed;
        uint256 confirmCount;
    }

    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmed;

    event TxSubmitted(uint256 indexed txId, address indexed to);
    event TxConfirmed(uint256 indexed txId, address indexed owner);
    event TxExecuted(uint256 indexed txId);

    modifier onlyOwner() {
        require(_isOwner(msg.sender), "NOT_OWNER");
        _;
    }

    constructor(address _owner1, address _owner2, address _owner3) {
        require(_owner1 != address(0) && _owner2 != address(0) && _owner3 != address(0), "ZERO");
        require(_owner1 != _owner2 && _owner1 != _owner3 && _owner2 != _owner3, "DUPLICATE");
        owners[0] = _owner1;
        owners[1] = _owner2;
        owners[2] = _owner3;
    }

    function submitTransaction(address _to, bytes calldata _data) external onlyOwner returns (uint256) {
        uint256 txId = transactions.length;
        transactions.push(Transaction({
            to: _to,
            data: _data,
            value: 0,
            executed: false,
            confirmCount: 1
        }));
        confirmed[txId][msg.sender] = true;
        emit TxSubmitted(txId, _to);
        emit TxConfirmed(txId, msg.sender);
        return txId;
    }

    function confirmTransaction(uint256 _txId) external onlyOwner {
        require(_txId < transactions.length, "BAD_TX");
        require(!confirmed[_txId][msg.sender], "ALREADY_CONFIRMED");
        require(!transactions[_txId].executed, "ALREADY_EXECUTED");
        confirmed[_txId][msg.sender] = true;
        transactions[_txId].confirmCount++;
        emit TxConfirmed(_txId, msg.sender);
    }

    function executeTransaction(uint256 _txId) external onlyOwner {
        Transaction storage t = transactions[_txId];
        require(!t.executed, "ALREADY_EXECUTED");
        require(t.confirmCount >= REQUIRED, "NOT_ENOUGH_CONFIRMS");
        t.executed = true;
        (bool ok, ) = t.to.call(t.data);
        require(ok, "TX_FAILED");
        emit TxExecuted(_txId);
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function _isOwner(address _addr) internal view returns (bool) {
        return _addr == owners[0] || _addr == owners[1] || _addr == owners[2];
    }

    receive() external payable {}
}
