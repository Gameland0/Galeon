// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// ============================================================
// GaleonTradeRecorder — 部署在 Ethereum Sepolia
// 职责：
//   1. 记录 AI 信号承诺（开仓）
//   2. 记录平仓事件
//   3. 从 Uniswap V3 WETH/USDC pool 读取实时价格
//      → 价格由链上 DEX 决定，无中心化预言机
// ============================================================

interface IUniswapV3PoolSlot0 {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24   tick,
            uint16  observationIndex,
            uint16  observationCardinality,
            uint16  observationCardinalityNext,
            uint8   feeProtocol,
            bool    unlocked
        );
    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract GaleonTradeRecorder {

    // ── 状态变量 ──────────────────────────────────────────────
    address public owner;
    address public relayer;       // 只有 relayer（我们的 off-chain worker）可以调用

    // Uniswap V3 WETH/USDC 0.3% pool on Sepolia
    // 实测有流动性：0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50
    IUniswapV3PoolSlot0 public uniswapPool;

    // 防重放：signalId 是否已提交
    mapping(bytes32 => bool) public committed;
    mapping(bytes32 => bool) public exited;

    // ── 事件（这两个事件是 Attestcoin 要证明的核心数据）────────
    event SignalCommitted(
        bytes32 indexed signalId,    // 唯一ID，由 relayer 生成
        string  symbol,              // 交易标的，如 "ETH"
        int8    direction,           // 1=LONG, -1=SHORT
        uint8   confidence,          // AI 置信度 0-100
        uint256 entryPrice,          // Uniswap 实时价格（USDC，6位小数）
        bytes32 reasonsHash,         // keccak256(AI分析原因，存 offchain）
        uint256 timestamp
    );

    event ExitRecorded(
        bytes32 indexed signalId,
        uint256 exitPrice,           // Uniswap 平仓时价格
        string  exitReason,          // "TAKE_PROFIT" | "STOP_LOSS" | "MAX_HOLD" | "DATA_BAIL"
        int256  pnlBps,              // (exitPrice - entryPrice) / entryPrice * 10000
        uint256 timestamp
    );

    // ── 构造 ──────────────────────────────────────────────────
    constructor(address _uniswapPool) {
        owner   = msg.sender;
        relayer = msg.sender;
        uniswapPool = IUniswapV3PoolSlot0(_uniswapPool);
    }

    // ── 权限修饰符 ────────────────────────────────────────────
    modifier onlyRelayer() {
        require(msg.sender == relayer, "only relayer");
        _;
    }
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    // ── 管理函数 ──────────────────────────────────────────────
    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }

    function setUniswapPool(address _pool) external onlyOwner {
        uniswapPool = IUniswapV3PoolSlot0(_pool);
    }

    // ── 核心函数：开仓信号提交 ────────────────────────────────
    function commitSignal(
        bytes32 signalId,
        string  calldata symbol,
        int8    direction,
        uint8   confidence,
        bytes32 reasonsHash
    ) external onlyRelayer {
        require(!committed[signalId], "already committed");
        require(direction == 1 || direction == -1, "direction must be 1 or -1");
        require(confidence <= 100, "confidence must be 0-100");

        committed[signalId] = true;

        uint256 price = _getUniswapPrice();

        emit SignalCommitted(
            signalId,
            symbol,
            direction,
            confidence,
            price,
            reasonsHash,
            block.timestamp
        );
    }

    // ── 核心函数：平仓记录 ────────────────────────────────────
    function recordExit(
        bytes32 signalId,
        uint256 entryPrice,    // 开仓价格（用于计算 pnl）
        string  calldata exitReason
    ) external onlyRelayer {
        require(committed[signalId], "not committed");
        require(!exited[signalId], "already exited");

        exited[signalId] = true;

        uint256 exitPrice = _getUniswapPrice();

        // 计算 P&L (bps = basis points, 1bps = 0.01%)
        int256 pnlBps = 0;
        if (entryPrice > 0) {
            pnlBps = (int256(exitPrice) - int256(entryPrice)) * 10000 / int256(entryPrice);
        }

        emit ExitRecorded(
            signalId,
            exitPrice,
            exitReason,
            pnlBps,
            block.timestamp
        );
    }

    // ── 内部：读 Uniswap V3 slot0 价格 ───────────────────────
    // Pool: 0x6Ce0896... token0=USDC(6dec), token1=WETH(18dec)
    // sqrtPriceX96 表示 sqrt(token1/token0) 的定点数
    // WETH 价格(USDC, 6dec) = 2^192 * 10^12 / sqrtPriceX96^2
    // 分两步避免溢出：先除 sqrtP，再除 sqrtP，乘 10^12 插在中间
    function _getUniswapPrice() internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = uniswapPool.slot0();
        if (sqrtPriceX96 == 0) return 0;
        uint256 sqrtP = uint256(sqrtPriceX96);
        // Q192 * 10^12 / sqrtP^2，分两步：
        // step1 = 2^192 / sqrtP = 2^96 * 2^96 / sqrtP
        // step2 = step1 * 10^12 / sqrtP
        // 2^96 ≈ 7.9e28, sqrtP ≈ 4.7e32 → step1 ≈ 1.3e19, 不溢出 uint256
        uint256 Q96 = 2 ** 96;
        uint256 step1 = Q96 * Q96 / sqrtP;         // 2^192 / sqrtP
        uint256 price = step1 * 1e12 / sqrtP;       // * 10^12 / sqrtP = USDC(6dec) per WETH
        return price;
    }

    // ── 只读：当前 Uniswap 价格（供 relayer 预查）───────────
    function getCurrentPrice() external view returns (uint256) {
        return _getUniswapPrice();
    }
}
