// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title GaleonBrain
 * @notice On-chain AI Trading Intelligence Layer for Monad
 * @dev Stores AI trade decisions, records AI-Endorsed Trades,
 *      and tracks Micro-Execution positions.
 *      Oracle pushes decisions from off-chain Brain.
 *      Any Monad app can query decisions and trader stats.
 */
contract GaleonBrain {
    address public oracle;
    address public owner;
    address public galeonRouter;

    // ========== Trade Decision ==========
    struct TradeDecision {
        string asset;
        uint8 direction;          // 0=WAIT, 1=LONG, 2=SHORT
        uint8 confidence;         // 0-100
        uint8 riskLevel;          // 0=LOW, 1=MEDIUM, 2=HIGH
        int256 entryPrice;        // 18 decimals
        int256 stopLoss;
        int256 takeProfit;
        string reasoning;
        uint16 similarSetups;
        uint8 historicalWinRate;  // 0-100
        uint256 timestamp;
    }

    // asset hash => latest decision
    mapping(bytes32 => TradeDecision) public latestDecisions;
    // decision history
    mapping(uint256 => TradeDecision) public decisionHistory;
    uint256 public decisionCount;

    // ========== AI-Endorsed Trade ==========
    struct AIEndorsedTrade {
        address trader;
        address token;
        uint256 amount;
        uint8 direction;
        uint8 confidence;
        uint8 riskLevel;
        uint16 similarSetups;
        uint8 historicalWinRate;
        uint256 decisionId;
        uint256 timestamp;
        bool settled;
        int256 pnlBps;           // basis points: +100 = +1%
        uint8 microSteps;        // total micro-execution steps
    }

    mapping(uint256 => AIEndorsedTrade) public endorsedTrades;
    uint256 public endorsedTradeCount;
    mapping(address => uint256[]) public traderHistory;

    // ========== Trader Stats (aggregated) ==========
    struct TraderStats {
        uint256 totalTrades;
        uint256 winCount;
        int256 totalPnlBps;
        uint256 totalMicroSteps;
    }
    mapping(address => TraderStats) public traderStats;

    // ========== Events ==========
    event DecisionPublished(
        string indexed assetIndexed,
        string asset,
        uint8 direction,
        uint8 confidence,
        uint256 decisionId
    );

    event TradeEndorsed(
        address indexed trader,
        address token,
        uint256 amount,
        uint8 confidence,
        uint256 tradeId
    );

    event TradeSettled(
        uint256 indexed tradeId,
        int256 pnlBps,
        uint8 microSteps
    );

    // ========== Constructor ==========
    constructor(address _oracle) {
        owner = msg.sender;
        oracle = _oracle;
    }

    // ========== Modifiers ==========
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == galeonRouter || msg.sender == oracle, "Only router or oracle");
        _;
    }

    // ========== Admin ==========
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function setRouter(address _router) external onlyOwner {
        galeonRouter = _router;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        owner = _newOwner;
    }

    // ========== Oracle: Publish Decision ==========
    function publishDecision(
        string calldata asset,
        uint8 direction,
        uint8 confidence,
        uint8 riskLevel,
        int256 entryPrice,
        int256 stopLoss,
        int256 takeProfit,
        string calldata reasoning,
        uint16 similarSetups,
        uint8 historicalWinRate
    ) external onlyOracle returns (uint256 decisionId) {
        decisionId = decisionCount++;

        TradeDecision memory d = TradeDecision({
            asset: asset,
            direction: direction,
            confidence: confidence,
            riskLevel: riskLevel,
            entryPrice: entryPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            reasoning: reasoning,
            similarSetups: similarSetups,
            historicalWinRate: historicalWinRate,
            timestamp: block.timestamp
        });

        bytes32 assetHash = keccak256(abi.encodePacked(asset));
        latestDecisions[assetHash] = d;
        decisionHistory[decisionId] = d;

        emit DecisionPublished(asset, asset, direction, confidence, decisionId);
    }

    // ========== Query: Get Latest Decision ==========
    function getTradeDecision(string calldata asset)
        external
        view
        returns (
            uint8 direction,
            uint8 confidence,
            uint8 riskLevel,
            int256 entryPrice,
            int256 stopLoss,
            int256 takeProfit,
            string memory reasoning,
            uint16 similarSetups,
            uint8 historicalWinRate,
            uint256 timestamp
        )
    {
        bytes32 assetHash = keccak256(abi.encodePacked(asset));
        TradeDecision storage d = latestDecisions[assetHash];
        return (
            d.direction,
            d.confidence,
            d.riskLevel,
            d.entryPrice,
            d.stopLoss,
            d.takeProfit,
            d.reasoning,
            d.similarSetups,
            d.historicalWinRate,
            d.timestamp
        );
    }

    // ========== Record AI-Endorsed Trade ==========
    function recordEndorsedTrade(
        address trader,
        address token,
        uint256 amount,
        uint256 decisionId
    ) external onlyRouter returns (uint256 tradeId) {
        TradeDecision storage d = decisionHistory[decisionId];

        tradeId = endorsedTradeCount++;

        endorsedTrades[tradeId] = AIEndorsedTrade({
            trader: trader,
            token: token,
            amount: amount,
            direction: d.direction,
            confidence: d.confidence,
            riskLevel: d.riskLevel,
            similarSetups: d.similarSetups,
            historicalWinRate: d.historicalWinRate,
            decisionId: decisionId,
            timestamp: block.timestamp,
            settled: false,
            pnlBps: 0,
            microSteps: 1
        });

        traderHistory[trader].push(tradeId);
        traderStats[trader].totalTrades++;

        emit TradeEndorsed(trader, token, amount, d.confidence, tradeId);
    }

    // ========== Update Micro-Step Count ==========
    function incrementMicroStep(uint256 tradeId) external onlyRouter {
        endorsedTrades[tradeId].microSteps++;
    }

    // ========== Settle Trade ==========
    function settleTrade(uint256 tradeId, int256 pnlBps) external onlyRouter {
        AIEndorsedTrade storage t = endorsedTrades[tradeId];
        require(!t.settled, "Already settled");

        t.settled = true;
        t.pnlBps = pnlBps;

        TraderStats storage stats = traderStats[t.trader];
        stats.totalPnlBps += pnlBps;
        stats.totalMicroSteps += t.microSteps;
        if (pnlBps > 0) {
            stats.winCount++;
        }

        emit TradeSettled(tradeId, pnlBps, t.microSteps);
    }

    // ========== Query: Trader Stats ==========
    function getTraderFullStats(address trader)
        external
        view
        returns (
            uint256 totalTrades,
            uint256 winCount,
            int256 totalPnlBps,
            uint256 totalMicroSteps,
            uint8 winRate
        )
    {
        TraderStats storage s = traderStats[trader];
        totalTrades = s.totalTrades;
        winCount = s.winCount;
        totalPnlBps = s.totalPnlBps;
        totalMicroSteps = s.totalMicroSteps;
        winRate = totalTrades > 0 ? uint8((winCount * 100) / totalTrades) : 0;
    }

    // ========== Query: Trader Trade Count ==========
    function getTraderTradeCount(address trader) external view returns (uint256) {
        return traderHistory[trader].length;
    }

    // ========== Query: Trader Trade ID by Index ==========
    function getTraderTradeId(address trader, uint256 index) external view returns (uint256) {
        return traderHistory[trader][index];
    }
}
