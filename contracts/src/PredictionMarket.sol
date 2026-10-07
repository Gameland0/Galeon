// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/**
 * @title PredictionMarket V2
 * @notice PT交易预测博弈合约
 *
 * V2 安全升级:
 *   ① 角色分离: OWNER(多签) + SETTLER(自动化单签)
 *   ② closeBetting: 平仓时锁定下注，防front-running
 *   ③ per-event settle冷却: 不再全局阻塞
 *   ④ emergencyWithdraw加timelock: pause后需等24h才能提款
 *   ⑤ guardian可紧急暂停合约（独立地址，只能暂停不能转钱）
 */
contract PredictionMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant PLATFORM_FEE_BPS = 200;   // 2% — 下注时收取
    uint256 public constant AVAILABLE_BPS = 10000;     // 100% 分给赢家，无储备池
    uint256 public constant MIN_BET = 1e6;             // $1
    uint256 public constant MAX_BET = 500e6;           // $500
    uint256 public constant MIN_POOL = 2e6;            // $2
    uint256 public constant MIN_PARTICIPANTS = 2;
    uint256 public constant SETTLE_COOLDOWN = 60;      // per-event冷却60秒

    uint256 public constant GATE_BPS = 200;             // 资格线: ±2% (统一)

    int256 public constant MIN_PREDICTION = -2000;     // -20%
    int256 public constant MAX_PREDICTION = 20000;     // +200%

    uint256 public constant WITHDRAW_DELAY = 24 hours; // 紧急提款等待期

    // ============ State ============

    IERC20 public immutable usdc;
    address public platformWallet;
    address public reserveWallet;
    address public guardian;             // 独立监控地址，只能暂停
    address public settler;             // 自动化结算地址（单签）

    bool public paused;
    uint256 public pausedAt;
    uint256 public constant UNPAUSE_DELAY = 24 hours;

    // emergencyWithdraw timelock
    uint256 public withdrawRequestTime;
    address public withdrawTarget;
    bool public withdrawRequested;

    enum Status { OPEN, BETTING_CLOSED, SETTLED, CANCELLED }

    struct Event {
        uint256 totalPool;
        uint256 participantCount;
        Status status;
        uint64 createdAt;
        int256 actualPnlBps;
        uint256 lastSettleTime;  // per-event冷却
    }

    struct Bet {
        address user;
        int256 predictedPnlBps;
        uint256 amount;
    }

    mapping(bytes32 => Event) public events;
    mapping(bytes32 => Bet[]) internal _bets;
    mapping(bytes32 => mapping(address => bool)) public hasBet;

    // ============ Events ============

    event EventCreated(bytes32 indexed eventId);
    event BettingClosed(bytes32 indexed eventId);
    event BetPlaced(bytes32 indexed eventId, address indexed user, int256 predictedPnlBps, uint256 amount);
    event EventSettled(bytes32 indexed eventId, int256 actualPnlBps, uint256 totalPayout, uint256 winnerCount);
    event EventCancelled(bytes32 indexed eventId, uint256 refundCount);
    event PayoutSent(bytes32 indexed eventId, address indexed user, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event SettlerUpdated(address indexed oldSettler, address indexed newSettler);
    event WithdrawRequested(address indexed target, uint256 requestTime);
    event WithdrawExecuted(address indexed target, uint256 amount);

    // ============ Modifiers ============

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier onlySettler() {
        require(msg.sender == settler || msg.sender == owner(), "NOT_SETTLER");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _usdc,
        address _platformWallet,
        address _reserveWallet,
        address _guardian,
        address _settler
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        platformWallet = _platformWallet;
        reserveWallet = _reserveWallet;
        guardian = _guardian;
        settler = _settler;
    }

    // ============ Pause ============

    function pause() external {
        require(msg.sender == guardian || msg.sender == owner(), "NOT_AUTHORIZED");
        paused = true;
        pausedAt = block.timestamp;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        require(block.timestamp >= pausedAt + UNPAUSE_DELAY, "UNPAUSE_TOO_SOON");
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ============ Settler: Create / CloseBetting / Cancel ============

    function createEvent(bytes32 _eventId) external onlySettler whenNotPaused {
        require(events[_eventId].createdAt == 0, "EXISTS");
        events[_eventId] = Event({
            totalPool: 0,
            participantCount: 0,
            status: Status.OPEN,
            createdAt: uint64(block.timestamp),
            actualPnlBps: 0,
            lastSettleTime: 0
        });
        emit EventCreated(_eventId);
    }

    /// @notice 平仓时调用，锁定下注。之后用户无法再placeBet
    function closeBetting(bytes32 _eventId) external onlySettler {
        Event storage evt = events[_eventId];
        require(evt.status == Status.OPEN, "NOT_OPEN");
        evt.status = Status.BETTING_CLOSED;
        emit BettingClosed(_eventId);
    }

    function cancelEvent(bytes32 _eventId) external onlySettler nonReentrant {
        Event storage evt = events[_eventId];
        require(evt.status == Status.OPEN || evt.status == Status.BETTING_CLOSED, "CANNOT_CANCEL");
        evt.status = Status.CANCELLED;

        Bet[] storage bets = _bets[_eventId];
        for (uint256 i = 0; i < bets.length; i++) {
            usdc.safeTransfer(bets[i].user, bets[i].amount);
        }
        emit EventCancelled(_eventId, bets.length);
    }

    // ============ User: Place Bet (需签名验证) ============

    /**
     * @notice 下注 — 开放给所有用户
     */
    function placeBet(
        bytes32 _eventId,
        int256 _predictedPnlBps,
        uint256 _amount
    ) external nonReentrant whenNotPaused {
        Event storage evt = events[_eventId];
        require(evt.status == Status.OPEN, "NOT_OPEN");
        require(!hasBet[_eventId][msg.sender], "ALREADY_BET");
        require(_amount >= MIN_BET && _amount <= MAX_BET, "BAD_AMOUNT");
        require(_predictedPnlBps >= MIN_PREDICTION && _predictedPnlBps <= MAX_PREDICTION, "BAD_PREDICTION");

        // 收取 2% 手续费
        uint256 fee = (_amount * PLATFORM_FEE_BPS) / 10000;
        uint256 netAmount = _amount - fee;

        usdc.safeTransferFrom(msg.sender, address(this), _amount);
        usdc.safeTransfer(platformWallet, fee);

        _bets[_eventId].push(Bet({
            user: msg.sender,
            predictedPnlBps: _predictedPnlBps,
            amount: netAmount
        }));

        hasBet[_eventId][msg.sender] = true;
        evt.totalPool += netAmount;
        evt.participantCount++;

        emit BetPlaced(_eventId, msg.sender, _predictedPnlBps, netAmount);
    }

    // ============ Settler: Settle ============

    function settle(
        bytes32 _eventId,
        int256 _actualPnlBps,
        uint256[] calldata _winnerIndices,
        uint256[] calldata _payouts
    ) external onlySettler nonReentrant whenNotPaused {
        Event storage evt = events[_eventId];

        // per-event冷却
        require(block.timestamp >= evt.lastSettleTime + SETTLE_COOLDOWN, "SETTLE_TOO_FAST");
        evt.lastSettleTime = block.timestamp;

        require(evt.status == Status.OPEN || evt.status == Status.BETTING_CLOSED, "NOT_SETTLEABLE");
        require(evt.participantCount >= MIN_PARTICIPANTS, "TOO_FEW");
        require(evt.totalPool >= MIN_POOL, "POOL_TOO_SMALL");
        require(_winnerIndices.length == _payouts.length, "LEN_MISMATCH");
        require(_winnerIndices.length <= 50, "TOO_MANY_WINNERS");
        require(_actualPnlBps >= MIN_PREDICTION && _actualPnlBps <= MAX_PREDICTION, "BAD_ACTUAL");

        // 防重复winner
        for (uint256 i = 0; i < _winnerIndices.length; i++) {
            for (uint256 j = i + 1; j < _winnerIndices.length; j++) {
                require(_winnerIndices[i] != _winnerIndices[j], "DUPLICATE_WINNER");
            }
        }

        Bet[] storage bets = _bets[_eventId];
        uint256 gate = GATE_BPS;

        // 验证1: 每个winner距离在资格线(±2%)内
        for (uint256 i = 0; i < _winnerIndices.length; i++) {
            require(_winnerIndices[i] < bets.length, "BAD_INDEX");
            uint256 dist = _absDiff(bets[_winnerIndices[i]].predictedPnlBps, _actualPnlBps);
            require(dist <= gate, "WINNER_NOT_QUALIFIED");
        }

        // 验证2: 非winner必须在资格线外（合格者必须全部入选）
        for (uint256 i = 0; i < bets.length; i++) {
            if (!_isInArray(i, _winnerIndices)) {
                uint256 dist = _absDiff(bets[i].predictedPnlBps, _actualPnlBps);
                require(dist > gate, "QUALIFIED_NOT_SELECTED");
            }
        }

        // 验证3: 总payout不超额
        uint256 availablePool = (evt.totalPool * AVAILABLE_BPS) / 10000;
        uint256 totalPayout = 0;
        for (uint256 i = 0; i < _payouts.length; i++) {
            totalPayout += _payouts[i];
        }
        require(totalPayout <= availablePool, "PAYOUT_EXCEEDS");

        // 执行
        evt.actualPnlBps = _actualPnlBps;
        evt.status = Status.SETTLED;

        for (uint256 i = 0; i < _winnerIndices.length; i++) {
            if (_payouts[i] > 0) {
                address winner = bets[_winnerIndices[i]].user;
                usdc.safeTransfer(winner, _payouts[i]);
                emit PayoutSent(_eventId, winner, _payouts[i]);
            }
        }

        uint256 reserveAmount = evt.totalPool - totalPayout;
        if (reserveAmount > 0) {
            usdc.safeTransfer(reserveWallet, reserveAmount);
        }

        emit EventSettled(_eventId, _actualPnlBps, totalPayout, _winnerIndices.length);
    }

    function settleNoWinner(
        bytes32 _eventId,
        int256 _actualPnlBps
    ) external onlySettler nonReentrant whenNotPaused {
        Event storage evt = events[_eventId];

        require(block.timestamp >= evt.lastSettleTime + SETTLE_COOLDOWN, "SETTLE_TOO_FAST");
        evt.lastSettleTime = block.timestamp;

        require(_actualPnlBps >= MIN_PREDICTION && _actualPnlBps <= MAX_PREDICTION, "BAD_ACTUAL");
        require(evt.status == Status.OPEN || evt.status == Status.BETTING_CLOSED, "NOT_SETTLEABLE");
        require(evt.participantCount >= MIN_PARTICIPANTS, "TOO_FEW");
        require(evt.totalPool >= MIN_POOL, "POOL_TOO_SMALL");

        Bet[] storage bets = _bets[_eventId];
        uint256 gate = GATE_BPS;

        for (uint256 i = 0; i < bets.length; i++) {
            uint256 dist = _absDiff(bets[i].predictedPnlBps, _actualPnlBps);
            require(dist > gate, "QUALIFIED_BET_EXISTS");
        }

        evt.actualPnlBps = _actualPnlBps;
        evt.status = Status.SETTLED;

        usdc.safeTransfer(reserveWallet, evt.totalPool);
        emit EventSettled(_eventId, _actualPnlBps, 0, 0);
    }

    // ============ Internal ============

    function _absDiff(int256 a, int256 b) internal pure returns (uint256) {
        return a >= b ? uint256(a - b) : uint256(b - a);
    }

    function _isInArray(uint256 val, uint256[] calldata arr) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == val) return true;
        }
        return false;
    }

    // ============ View ============

    function getEvent(bytes32 _eventId) external view returns (
        uint256 totalPool, uint256 participantCount, Status status,
        uint64 createdAt, int256 actualPnlBps
    ) {
        Event storage evt = events[_eventId];
        return (evt.totalPool, evt.participantCount, evt.status, evt.createdAt, evt.actualPnlBps);
    }

    function getBetCount(bytes32 _eventId) external view returns (uint256) {
        return _bets[_eventId].length;
    }

    function getBet(bytes32 _eventId, uint256 _index) external view returns (
        address user, int256 predictedPnlBps, uint256 amount
    ) {
        Bet storage b = _bets[_eventId][_index];
        return (b.user, b.predictedPnlBps, b.amount);
    }

    function getUserBet(bytes32 _eventId, address _user) external view returns (
        int256 predictedPnlBps, uint256 amount
    ) {
        Bet[] storage bets = _bets[_eventId];
        for (uint256 i = 0; i < bets.length; i++) {
            if (bets[i].user == _user) {
                return (bets[i].predictedPnlBps, bets[i].amount);
            }
        }
        revert("NO_BET");
    }

    // ============ Owner Config ============

    function setGuardian(address _guardian) external onlyOwner {
        require(_guardian != address(0), "ZERO_ADDR");
        require(paused, "MUST_BE_PAUSED");
        emit GuardianUpdated(guardian, _guardian);
        guardian = _guardian;
    }

    function setSettler(address _settler) external onlyOwner {
        require(_settler != address(0), "ZERO_ADDR");
        emit SettlerUpdated(settler, _settler);
        settler = _settler;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "ZERO_ADDR");
        require(paused, "MUST_BE_PAUSED");
        platformWallet = _wallet;
    }

    function setReserveWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "ZERO_ADDR");
        require(paused, "MUST_BE_PAUSED");
        reserveWallet = _wallet;
    }

    // ============ Emergency Withdraw (24h timelock) ============

    function requestWithdraw(address _to) external onlyOwner {
        require(paused, "MUST_BE_PAUSED");
        require(_to != address(0), "ZERO_ADDR");
        withdrawTarget = _to;
        withdrawRequestTime = block.timestamp;
        withdrawRequested = true;
        emit WithdrawRequested(_to, block.timestamp);
    }

    function executeWithdraw(uint256 _amount) external onlyOwner {
        require(paused, "MUST_BE_PAUSED");
        require(withdrawRequested, "NO_REQUEST");
        require(block.timestamp >= withdrawRequestTime + WITHDRAW_DELAY, "TOO_EARLY");
        withdrawRequested = false;
        usdc.safeTransfer(withdrawTarget, _amount);
        emit WithdrawExecuted(withdrawTarget, _amount);
    }

    function cancelWithdraw() external onlyOwner {
        withdrawRequested = false;
    }
}
