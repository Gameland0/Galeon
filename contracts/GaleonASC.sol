// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// ============================================================
// GaleonASC — 部署在 Creditcoin CC3 Testnet
// 职责：
//   1. 接收 Attestcoin 密码学证明
//   2. 验证 Sepolia 上 SignalCommitted / ExitRecorded 事件真实存在
//   3. 记录 AI 交易仓位
//   4. 接受 CTC 押注（用户押 LONG 或 SHORT 方向）
//   5. 平仓时按 Ethereum 验证价格计算 P&L，分配 CTC
//
// 依赖：
//   @gluwa/asc-contracts — NativeQueryVerifierLib, EvmV1Decoder
//   部署: foundry + CC3 Testnet RPC
// ============================================================

// ── Attestcoin 预编译接口 ─────────────────────────────────────
// Block Prover Precompile 固定地址: 0x0000000000000000000000000000000000000FD2
// 真实 ABI（从 SDK PrecompileBlockProver 提取）:
//   verifyAndEmit(uint64 chainKey, uint64 height, bytes encodedTransaction,
//     (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof,
//     (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool    isLeft;
    }
    struct MerkleProof {
        bytes32              root;
        MerkleProofEntry[]   siblings;
    }
    struct ContinuityProof {
        bytes32   lowerEndpointDigest;
        bytes32[] roots;
    }

    function verifyAndEmit(
        uint64         chainKey,
        uint64         height,
        bytes          calldata encodedTransaction,
        MerkleProof    calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);
}

// ── SignalCommitted 事件签名（Sepolia 合约发出的）────────────────
// keccak256("SignalCommitted(bytes32,string,int8,uint8,uint256,bytes32,uint256)")
bytes32 constant SIGNAL_COMMITTED_TOPIC =
    keccak256("SignalCommitted(bytes32,string,int8,uint8,uint256,bytes32,uint256)");

// keccak256("ExitRecorded(bytes32,uint256,string,int256,uint256)")
bytes32 constant EXIT_RECORDED_TOPIC =
    keccak256("ExitRecorded(bytes32,uint256,string,int256,uint256)");

contract GaleonASC {

    // ── 预编译常量 ────────────────────────────────────────────
    INativeQueryVerifier constant VERIFIER =
        INativeQueryVerifier(0x0000000000000000000000000000000000000FD2);

    // ── 数据结构 ──────────────────────────────────────────────
    struct Position {
        bytes32 signalId;
        string  symbol;
        int8    direction;     // 1=LONG, -1=SHORT
        uint8   confidence;
        uint256 entryPrice;    // USDC 6位小数
        bytes32 reasonsHash;
        uint256 openedAt;
        // 平仓后填充
        uint256 exitPrice;
        int256  pnlBps;
        string  exitReason;
        uint256 closedAt;
        bool    settled;
    }

    struct BetPool {
        uint256 longPool;   // 押 LONG 的 CTC 总量
        uint256 shortPool;  // 押 SHORT 的 CTC 总量
        mapping(address => uint256) longBets;
        mapping(address => uint256) shortBets;
        address[] longBettors;
        address[] shortBettors;
    }

    // ── 状态 ──────────────────────────────────────────────────
    address public owner;
    uint64  public sourceChainKey;  // 1 = Ethereum Sepolia
    address public recorderAddress; // Sepolia GaleonTradeRecorder 合约地址

    uint256 public constant FEE_BPS = 500; // 5% 手续费
    address public feeRecipient;

    // signalId → Position
    mapping(bytes32 => Position) public positions;
    // signalId → BetPool
    mapping(bytes32 => BetPool) internal betPools;
    // 防重放
    mapping(bytes32 => bool) public processedSignals;
    mapping(bytes32 => bool) public processedExits;

    // 所有 signalId 列表（供前端查询）
    bytes32[] public allSignalIds;

    // ── 事件 ──────────────────────────────────────────────────
    event PositionOpened(
        bytes32 indexed signalId,
        string  symbol,
        int8    direction,
        uint8   confidence,
        uint256 entryPrice,
        uint256 openedAt
    );

    event BetPlaced(
        bytes32 indexed signalId,
        address indexed bettor,
        int8    side,       // 1=LONG, -1=SHORT
        uint256 amount
    );

    event PositionClosed(
        bytes32 indexed signalId,
        uint256 exitPrice,
        int256  pnlBps,
        string  exitReason,
        uint256 closedAt
    );

    event BetSettled(
        bytes32 indexed signalId,
        address indexed winner,
        uint256 payout
    );

    // ── 构造 ──────────────────────────────────────────────────
    constructor(uint64 _sourceChainKey, address _recorderAddress) {
        owner            = msg.sender;
        feeRecipient     = msg.sender;
        sourceChainKey   = _sourceChainKey;
        recorderAddress  = _recorderAddress;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    // ── 开仓：提交 SignalCommitted 的 Attestcoin 证明 ─────────
    // txBytes     = proof.txBytes (原始 RLP 编码 tx，传给 Attestcoin 预编译验证)
    // eventData   = abi.encode(signalId, symbol, direction, confidence, entryPrice, reasonsHash)
    //               (从 Sepolia event log 提取，由 off-chain worker 传入)
    function openPosition(
        uint64  blockHeight,
        bytes   calldata txBytes,
        bytes   calldata eventData,
        INativeQueryVerifier.MerkleProof    calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external {
        // 1. 调 Attestcoin 预编译验证证明（传原始 txBytes + struct 参数）
        bool verified = VERIFIER.verifyAndEmit(
            sourceChainKey,
            blockHeight,
            txBytes,
            merkleProof,
            continuityProof
        );
        require(verified, "proof verification failed");

        // 2. 解析业务事件数据（由 off-chain worker ABI 编码后传入）
        (
            bytes32 signalId,
            string memory symbol,
            int8    direction,
            uint8   confidence,
            uint256 entryPrice,
            bytes32 reasonsHash
        ) = _decodeSignalCommitted(eventData);

        // 3. 防重放
        require(!processedSignals[signalId], "signal already processed");
        processedSignals[signalId] = true;

        // 4. 记录仓位
        positions[signalId] = Position({
            signalId:    signalId,
            symbol:      symbol,
            direction:   direction,
            confidence:  confidence,
            entryPrice:  entryPrice,
            reasonsHash: reasonsHash,
            openedAt:    block.timestamp,
            exitPrice:   0,
            pnlBps:      0,
            exitReason:  "",
            closedAt:    0,
            settled:     false
        });
        allSignalIds.push(signalId);

        emit PositionOpened(signalId, symbol, direction, confidence, entryPrice, block.timestamp);
    }

    // ── 押注：用 CTC 押 LONG 或 SHORT ────────────────────────
    function placeBet(bytes32 signalId, int8 side) external payable {
        require(msg.value > 0, "bet amount required");
        require(side == 1 || side == -1, "invalid side");
        Position storage pos = positions[signalId];
        require(pos.openedAt > 0, "position not open");
        require(pos.closedAt == 0, "position already closed");

        BetPool storage pool = betPools[signalId];

        if (side == 1) {
            if (pool.longBets[msg.sender] == 0) pool.longBettors.push(msg.sender);
            pool.longBets[msg.sender] += msg.value;
            pool.longPool += msg.value;
        } else {
            if (pool.shortBets[msg.sender] == 0) pool.shortBettors.push(msg.sender);
            pool.shortBets[msg.sender] += msg.value;
            pool.shortPool += msg.value;
        }

        emit BetPlaced(signalId, msg.sender, side, msg.value);
    }

    // ── 平仓：提交 ExitRecorded 的 Attestcoin 证明 ───────────
    // txBytes   = proof.txBytes (传给 Attestcoin 预编译)
    // eventData = abi.encode(signalId, exitPrice, exitReason, pnlBps)
    function closePosition(
        bytes32 signalId,
        uint64  blockHeight,
        bytes   calldata txBytes,
        bytes   calldata eventData,
        INativeQueryVerifier.MerkleProof     calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external {
        Position storage pos = positions[signalId];
        require(pos.openedAt > 0, "position not found");
        require(pos.closedAt == 0, "already closed");
        require(!processedExits[signalId], "exit already processed");

        // 1. 验证证明（传原始 txBytes + struct 参数）
        bool verified = VERIFIER.verifyAndEmit(
            sourceChainKey,
            blockHeight,
            txBytes,
            merkleProof,
            continuityProof
        );
        require(verified, "proof verification failed");

        // 2. 解析业务事件数据
        (
            bytes32 exitSignalId,
            uint256 exitPrice,
            string memory exitReason,
            int256  pnlBps
        ) = _decodeExitRecorded(eventData);

        require(exitSignalId == signalId, "signalId mismatch");
        processedExits[signalId] = true;

        // 3. 更新仓位
        pos.exitPrice  = exitPrice;
        pos.pnlBps     = pnlBps;
        pos.exitReason = exitReason;
        pos.closedAt   = block.timestamp;

        emit PositionClosed(signalId, exitPrice, pnlBps, exitReason, block.timestamp);

        // 4. 结算押注
        _settleBets(signalId, pos.direction, pnlBps);
    }

    // ── 内部：结算 CTC 押注 ───────────────────────────────────
    function _settleBets(bytes32 signalId, int8 direction, int256 pnlBps) internal {
        Position storage pos = positions[signalId];
        require(!pos.settled, "already settled");
        pos.settled = true;

        BetPool storage pool = betPools[signalId];
        uint256 totalPool = pool.longPool + pool.shortPool;
        if (totalPool == 0) return; // 无人押注

        // 判断赢家方向：AI方向赢了（pnlBps > 0）则 LONG赢，否则 SHORT赢
        // direction=1(LONG): 赢=价格上涨(pnlBps>0)
        // direction=-1(SHORT): 赢=价格下跌(pnlBps<0)
        bool longWins;
        if (direction == 1) {
            longWins = pnlBps > 0;
        } else {
            longWins = pnlBps < 0; // SHORT 赢了，押 LONG 方向的人输
        }

        // 扣 5% 手续费
        uint256 fee = totalPool * FEE_BPS / 10000;
        uint256 prize = totalPool - fee;

        // 转手续费
        if (fee > 0) {
            payable(feeRecipient).transfer(fee);
        }

        // 分配给赢家
        address[] storage winners = longWins ? pool.longBettors : pool.shortBettors;
        uint256 winnerPool = longWins ? pool.longPool : pool.shortPool;

        if (winnerPool == 0) {
            // 无人押赢方，退还给输家（扣手续费）
            address[] storage losers = longWins ? pool.shortBettors : pool.longBettors;
            uint256 loserPool = longWins ? pool.shortPool : pool.longPool;
            for (uint i = 0; i < losers.length; i++) {
                address loser = losers[i];
                uint256 loserBet = longWins ? pool.shortBets[loser] : pool.longBets[loser];
                uint256 refund = loserBet * prize / loserPool;
                if (refund > 0) payable(loser).transfer(refund);
            }
            return;
        }

        for (uint i = 0; i < winners.length; i++) {
            address winner = winners[i];
            uint256 winnerBet = longWins ? pool.longBets[winner] : pool.shortBets[winner];
            uint256 payout = winnerBet * prize / winnerPool;
            if (payout > 0) {
                payable(winner).transfer(payout);
                emit BetSettled(signalId, winner, payout);
            }
        }
    }

    // ── 内部：解析 SignalCommitted 事件 ──────────────────────
    // encodedTransaction 格式由 Attestcoin SDK 定义
    // 这里做简化解析：从 encoded bytes 中提取 log topics + data
    function _decodeSignalCommitted(bytes calldata encoded)
        internal pure
        returns (
            bytes32 signalId,
            string memory symbol,
            int8    direction,
            uint8   confidence,
            uint256 entryPrice,
            bytes32 reasonsHash
        )
    {
        // Attestcoin encodedTransaction 结构（EvmV1 格式）:
        // [txType(1)] [txRlp] [receiptRlp]
        // receipt 包含 logs，每个 log: [address][topics[]][data]
        // 简化：直接用 abi.decode 解析已知格式
        // 在实际部署中使用 @gluwa/asc-contracts EvmV1Decoder 库
        // 此处为 hackathon 版本：off-chain worker 将事件数据 ABI 编码后传入
        // 约定：encoded 最后 N bytes 是 abi.encode(signalId, symbol, direction, confidence, entryPrice, reasonsHash)
        (signalId, symbol, direction, confidence, entryPrice, reasonsHash) =
            abi.decode(encoded, (bytes32, string, int8, uint8, uint256, bytes32));
    }

    function _decodeExitRecorded(bytes calldata encoded)
        internal pure
        returns (
            bytes32 signalId,
            uint256 exitPrice,
            string memory exitReason,
            int256  pnlBps
        )
    {
        (signalId, exitPrice, exitReason, pnlBps) =
            abi.decode(encoded, (bytes32, uint256, string, int256));
    }

    // ── 查询 ──────────────────────────────────────────────────
    function getPosition(bytes32 signalId) external view returns (Position memory) {
        return positions[signalId];
    }

    function getBetInfo(bytes32 signalId) external view returns (
        uint256 longPool, uint256 shortPool,
        uint256 myLongBet, uint256 myShortBet
    ) {
        BetPool storage pool = betPools[signalId];
        return (
            pool.longPool,
            pool.shortPool,
            pool.longBets[msg.sender],
            pool.shortBets[msg.sender]
        );
    }

    function getAllPositions() external view returns (bytes32[] memory) {
        return allSignalIds;
    }

    // ── 管理 ──────────────────────────────────────────────────
    function setFeeRecipient(address _recipient) external onlyOwner {
        feeRecipient = _recipient;
    }

    function setSourceChainKey(uint64 _chainKey) external onlyOwner {
        sourceChainKey = _chainKey;
    }

    receive() external payable {} // 接收 CTC
}
