// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./GaleonBrain.sol";

/**
 * @title GaleonRouter V2
 * @notice AI Auto-Trade Router — Oracle executes trades on behalf of users
 *
 * Flow:
 *   1. User approves USDC to this contract (with amount limit)
 *   2. User calls enableAutoTrade(maxAmount, duration)
 *   3. Oracle detects Brain signal → calls executeSwapFor(user, ...)
 *   4. Contract: transferFrom user → deduct 0.5% fee → swap via Kuru → send output to user
 *   5. User can revokeAutoTrade() anytime
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract GaleonRouter {
    address public owner;
    address public oracle;
    GaleonBrain public galeonBrain;
    address public feeReceiver;
    uint256 public feeRate = 50; // 0.5% = 50 / 10000

    // Approved DEX targets
    mapping(address => bool) public approvedTargets;

    // ========== User Auto-Trade Authorization ==========
    struct UserAuth {
        bool enabled;
        uint256 maxPerTrade;      // Max USDC per single trade
        uint256 totalLimit;       // Total USDC authorized
        uint256 totalUsed;        // Total USDC used so far
        uint256 expiresAt;        // Authorization expiry timestamp
    }
    mapping(address => UserAuth) public userAuths;
    address[] public authorizedUsers;

    // ========== Positions ==========
    struct Position {
        address trader;
        address tokenIn;
        address tokenOut;
        uint256 totalAmountIn;
        uint256 totalTokenAmount;
        uint256 realizedPnl;
        uint8 stepCount;
        uint256 decisionId;
        uint256 endorsedTradeId;
        bool isOpen;
        uint256 openedAt;
    }

    mapping(uint256 => Position) public positions;
    uint256 public positionCount;
    mapping(address => uint256[]) public traderPositions;

    // ========== Events ==========
    event AutoTradeEnabled(address indexed user, uint256 maxPerTrade, uint256 totalLimit, uint256 expiresAt);
    event AutoTradeRevoked(address indexed user);
    event SwapExecutedFor(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee);
    event PositionOpened(uint256 indexed positionId, address indexed trader, address token, uint256 amount, uint256 decisionId);
    event PositionClosed(uint256 indexed positionId, uint256 totalIn, uint256 totalOut, int256 pnlBps);
    event FeeCollected(address indexed user, uint256 feeAmount);

    constructor(address _galeonBrain, address _oracle, address _feeReceiver) {
        owner = msg.sender;
        oracle = _oracle;
        galeonBrain = GaleonBrain(_galeonBrain);
        feeReceiver = _feeReceiver;
    }

    // ========== Modifiers ==========
    modifier onlyOwner() { require(msg.sender == owner, "Only owner"); _; }
    modifier onlyOracle() { require(msg.sender == oracle, "Only oracle"); _; }

    // ========== Admin ==========
    function setOracle(address _oracle) external onlyOwner { oracle = _oracle; }
    function setFeeRate(uint256 _feeRate) external onlyOwner { require(_feeRate <= 100, "Fee too high"); feeRate = _feeRate; }
    function setFeeReceiver(address _feeReceiver) external onlyOwner { feeReceiver = _feeReceiver; }
    function setApprovedTarget(address target, bool approved) external onlyOwner { approvedTargets[target] = approved; }

    // ========== User: Enable Auto-Trade ==========
    /**
     * @notice User enables auto-trade with limits
     * @param maxPerTrade Max USDC per single trade (6 decimals)
     * @param totalLimit Total USDC authorized for all trades
     * @param durationDays How many days the authorization is valid
     */
    function enableAutoTrade(uint256 maxPerTrade, uint256 totalLimit, uint256 durationDays) external {
        userAuths[msg.sender] = UserAuth({
            enabled: true,
            maxPerTrade: maxPerTrade,
            totalLimit: totalLimit,
            totalUsed: 0,
            expiresAt: block.timestamp + (durationDays * 1 days)
        });
        authorizedUsers.push(msg.sender);
        emit AutoTradeEnabled(msg.sender, maxPerTrade, totalLimit, block.timestamp + (durationDays * 1 days));
    }

    /**
     * @notice User revokes auto-trade authorization
     */
    function revokeAutoTrade() external {
        userAuths[msg.sender].enabled = false;
        emit AutoTradeRevoked(msg.sender);
    }

    /**
     * @notice Check if user's auto-trade is valid
     */
    function isUserAuthorized(address user, uint256 amount) public view returns (bool) {
        UserAuth storage auth = userAuths[user];
        if (!auth.enabled) return false;
        if (block.timestamp > auth.expiresAt) return false;
        if (amount > auth.maxPerTrade) return false;
        if (auth.totalUsed + amount > auth.totalLimit) return false;
        return true;
    }

    // ========== Fee ==========
    function _collectFee(address token, uint256 amount) internal returns (uint256 afterFee) {
        uint256 fee = (amount * feeRate) / 10000;
        afterFee = amount - fee;
        if (fee > 0) {
            IERC20(token).transfer(feeReceiver, fee);
            emit FeeCollected(msg.sender, fee);
        }
    }

    // ========== Oracle: Execute Swap For User ==========
    /**
     * @notice Oracle executes a swap on behalf of an authorized user
     * @param user The user whose funds will be used
     * @param target DEX router address (must be approved)
     * @param tokenIn Token being sold (USDC)
     * @param tokenOut Token being bought (MON)
     * @param amountIn Amount of tokenIn
     * @param swapCalldata Pre-built calldata from Kuru Flow API
     * @param decisionId Brain decision ID
     */
    function executeSwapFor(
        address user,
        address target,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata swapCalldata,
        uint256 decisionId
    ) external onlyOracle returns (uint256 amountOut) {
        // Check authorization
        require(isUserAuthorized(user, amountIn), "User not authorized or limit exceeded");
        require(approvedTargets[target], "Target not approved");

        // Update usage
        userAuths[user].totalUsed += amountIn;

        // Transfer tokenIn from USER (not oracle)
        IERC20(tokenIn).transferFrom(user, address(this), amountIn);

        // Collect fee
        uint256 swapAmount = _collectFee(tokenIn, amountIn);

        // Execute swap
        IERC20(tokenIn).approve(target, swapAmount);
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool success,) = target.call(swapCalldata);
        require(success, "Swap failed");
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        // Send output to USER (not oracle)
        IERC20(tokenOut).transfer(user, amountOut);

        // Record AI endorsement
        galeonBrain.recordEndorsedTrade(user, tokenOut, amountIn, decisionId);

        emit SwapExecutedFor(user, tokenIn, tokenOut, amountIn, amountOut, (amountIn * feeRate) / 10000);
    }

    // ========== Oracle: Open Position For User ==========
    function openPositionFor(
        address user,
        address target,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata swapCalldata,
        uint256 decisionId
    ) external onlyOracle returns (uint256 positionId) {
        require(isUserAuthorized(user, amountIn), "User not authorized");
        require(approvedTargets[target], "Target not approved");

        userAuths[user].totalUsed += amountIn;

        IERC20(tokenIn).transferFrom(user, address(this), amountIn);
        uint256 swapAmount = _collectFee(tokenIn, amountIn);

        IERC20(tokenIn).approve(target, swapAmount);
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool success,) = target.call(swapCalldata);
        require(success, "Swap failed");
        uint256 amountOut = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        // Keep tokens in contract for position management
        uint256 endorsedTradeId = galeonBrain.recordEndorsedTrade(user, tokenOut, amountIn, decisionId);

        positionId = positionCount++;
        positions[positionId] = Position({
            trader: user,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            totalAmountIn: amountIn,
            totalTokenAmount: amountOut,
            realizedPnl: 0,
            stepCount: 1,
            decisionId: decisionId,
            endorsedTradeId: endorsedTradeId,
            isOpen: true,
            openedAt: block.timestamp
        });

        traderPositions[user].push(positionId);
        emit PositionOpened(positionId, user, tokenOut, amountIn, decisionId);
    }

    // ========== Oracle: Close Position (sell back to tokenIn) ==========
    function closePositionFor(
        uint256 positionId,
        address target,
        bytes calldata swapCalldata
    ) external onlyOracle {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "Closed");
        require(approvedTargets[target], "Target not approved");

        uint256 remainingTokens = pos.totalTokenAmount;
        uint256 exitProceeds = 0;

        if (remainingTokens > 0) {
            IERC20(pos.tokenOut).approve(target, remainingTokens);
            uint256 balBefore = IERC20(pos.tokenIn).balanceOf(address(this));
            (bool success,) = target.call(swapCalldata);
            require(success, "Swap failed");
            uint256 amountOut = IERC20(pos.tokenIn).balanceOf(address(this)) - balBefore;
            exitProceeds = _collectFee(pos.tokenIn, amountOut);
            // Send proceeds to user
            IERC20(pos.tokenIn).transfer(pos.trader, exitProceeds);
        }

        uint256 totalOut = pos.realizedPnl + exitProceeds;
        int256 pnlBps = pos.totalAmountIn > 0
            ? int256((totalOut * 10000) / pos.totalAmountIn) - 10000
            : int256(0);

        pos.isOpen = false;
        pos.totalTokenAmount = 0;
        pos.stepCount++;
        galeonBrain.incrementMicroStep(pos.endorsedTradeId);
        galeonBrain.settleTrade(pos.endorsedTradeId, pnlBps);

        emit PositionClosed(positionId, pos.totalAmountIn, totalOut, pnlBps);
    }

    // ========== User: Direct Swap (user calls themselves) ==========
    function executeSwap(
        address target,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata swapCalldata,
        uint256 decisionId
    ) external returns (uint256 amountOut) {
        require(approvedTargets[target], "Target not approved");

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 swapAmount = _collectFee(tokenIn, amountIn);

        IERC20(tokenIn).approve(target, swapAmount);
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool success,) = target.call(swapCalldata);
        require(success, "Swap failed");
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        IERC20(tokenOut).transfer(msg.sender, amountOut);
        galeonBrain.recordEndorsedTrade(msg.sender, tokenOut, amountIn, decisionId);

        emit SwapExecutedFor(msg.sender, tokenIn, tokenOut, amountIn, amountOut, (amountIn * feeRate) / 10000);
    }

    // ========== Query ==========
    function getTraderPositionCount(address trader) external view returns (uint256) {
        return traderPositions[trader].length;
    }

    function getAuthorizedUserCount() external view returns (uint256) {
        return authorizedUsers.length;
    }

    function getUserAuth(address user) external view returns (bool enabled, uint256 maxPerTrade, uint256 totalLimit, uint256 totalUsed, uint256 expiresAt) {
        UserAuth storage auth = userAuths[user];
        return (auth.enabled, auth.maxPerTrade, auth.totalLimit, auth.totalUsed, auth.expiresAt);
    }

    // ========== Rescue ==========
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    receive() external payable {}
}
