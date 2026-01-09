/**
 * 风控管理服务
 * 功能:
 * 1. 交易前风险检查
 * 2. 持仓限制检查
 * 3. 单日亏损限制
 * 4. 熔断机制
 * 5. 余额检查
 * 6. 黑白名单检查
 */

const DatabaseService = require('../databaseService');
const LiquidityMonitor = require('./LiquidityMonitor');
const { ethers } = require('ethers');
const rpcProvider = require('../../utils/rpcProvider');

class RiskController {
  constructor() {
    // 默认风控参数 (可被用户配置覆盖)
    this.defaults = {
      maxPositions: 3,                    // 最大持仓数
      maxTradeAmount: 100,                // 单笔最大金额 (USD)
      dailyLossLimit: -10,                // 单日亏损限额 (%)
      singleTokenMaxPercent: 30,          // 单代币最大仓位 (%)
      minLiquidityRequired: 200000,       // 最低流动性 (USD)
      maxSlippage: 10,                    // 最大滑点 (%)
      circuitBreakerThreshold: 3,         // 熔断阈值 (连续失败次数)
      circuitBreakerDuration: 3600000,    // 熔断时长 (1小时)
    };

    // 使用 RPCProvider 工具类（支持多 RPC 轮询和故障切换）
    this.rpcProvider = rpcProvider;

    // USDT 合约地址 (支持多个稳定币)
    this.usdtContracts = {
      BSC: [
        '0x55d398326f99059fF775485246999027B3197955',  // BSC USDT
        '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',  // BSC BUSD
        '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',  // BSC USDC
      ],
      Base: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'], // Base USDC
    };

    // ERC20 ABI (仅包含 balanceOf)
    this.erc20ABI = [
      'function balanceOf(address owner) view returns (uint256)'
    ];

    console.log('✅ RiskController initialized with on-chain balance support');
  }

  /**
   * 交易前风险检查 (完整检查)
   */
  async checkTradeRisk(strategyOrUserId, signal, tradeAmount) {
    // 🔧 支持传递策略对象或 user_id
    const userConfig = typeof strategyOrUserId === 'object' ? strategyOrUserId : await this.getUserConfig(strategyOrUserId);
    const userId = userConfig?.user_id || strategyOrUserId;

    console.log(`\n🛡️ 风险检查: ${userId} -> ${signal.token_symbol} ($${tradeAmount})`);

    const risks = [];

    try {
      // 1. 检查用户是否启用自动交易
      if (!userConfig) {
        risks.push({ level: 'CRITICAL', reason: '用户配置不存在' });
        return { passed: false, risks };
      }

      if (!userConfig.enabled) {
        risks.push({ level: 'CRITICAL', reason: '自动交易未启用' });
        return { passed: false, risks };
      }

      // 🆕 2. 检查信号类型 (P1.2: 仅支持 LONG/BUY)
      const signalTypeCheck = this.checkSignalType(signal);
      if (!signalTypeCheck.passed) {
        risks.push({ level: 'CRITICAL', reason: signalTypeCheck.reason });
        return { passed: false, risks };
      }

      // 3. 检查跟单策略 - 是否应该跟这个信号
      const strategyCheck = await this.checkFollowStrategy(userConfig, signal);
      if (!strategyCheck.passed) {
        risks.push({ level: 'INFO', reason: strategyCheck.reason });
        return { passed: false, risks };
      }

      // 3. 检查是否被暂停 (熔断)
      if (userConfig.paused_until) {
        const pausedUntil = new Date(userConfig.paused_until);
        if (pausedUntil > new Date()) {
          risks.push({
            level: 'CRITICAL',
            reason: `账户已暂停至 ${pausedUntil.toLocaleString()}: ${userConfig.pause_reason}`
          });
          return { passed: false, risks };
        }
      }

      // 3. 检查余额
      const balanceCheck = await this.checkBalance(userId, tradeAmount, signal.chain);
      if (!balanceCheck.passed) {
        risks.push({ level: 'CRITICAL', reason: balanceCheck.reason });
        return { passed: false, risks };
      }

      // 4. 检查持仓限制
      const positionCheck = await this.checkPositionLimits(userId, userConfig);
      if (!positionCheck.passed) {
        risks.push({ level: 'CRITICAL', reason: positionCheck.reason });
        return { passed: false, risks };
      }

      // 5. 检查单笔金额限制
      if (tradeAmount > parseFloat(userConfig.max_trade_amount)) {
        risks.push({
          level: 'CRITICAL',
          reason: `交易金额 $${tradeAmount} 超过限制 $${userConfig.max_trade_amount}`
        });
        return { passed: false, risks };
      }

      // 6. 检查单日亏损
      const lossCheck = await this.checkDailyLoss(userId, userConfig);
      if (!lossCheck.passed) {
        risks.push({ level: 'CRITICAL', reason: lossCheck.reason });
        return { passed: false, risks };
      }

      // 7. 检查代币白名单
      const whitelistCheck = await this.checkWhitelist(signal.token_symbol, signal.chain, userConfig);
      if (!whitelistCheck.passed) {
        risks.push({ level: 'CRITICAL', reason: whitelistCheck.reason });
        return { passed: false, risks };
      }

      // 8. 检查流动性
      const liquidityCheck = await this.checkLiquidity(signal.token_symbol, signal.chain, userConfig);
      if (!liquidityCheck.passed) {
        risks.push({ level: 'HIGH', reason: liquidityCheck.reason });
        // 流动性不足是高风险，但不是硬性阻止
      }

      // 9. 检查单代币仓位占比
      const concentrationCheck = await this.checkConcentration(userId, signal.token_symbol, tradeAmount, userConfig);
      if (!concentrationCheck.passed) {
        risks.push({ level: 'MEDIUM', reason: concentrationCheck.reason });
      }

      console.log(`   ✅ 风险检查通过 (${risks.length} 个警告)`);

      return {
        passed: true,
        risks,
        userConfig
      };

    } catch (error) {
      console.error(`   ❌ 风险检查失败: ${error.message}`);
      return {
        passed: false,
        risks: [{ level: 'CRITICAL', reason: `检查失败: ${error.message}` }]
      };
    }
  }

  /**
   * 🆕 P1.2: 检查信号类型 (仅支持 LONG/BUY)
   * 作为 AutoTradeService 信号过滤的额外安全层
   */
  checkSignalType(signal) {
    const signalType = signal.signal_type;

    if (!signalType) {
      return {
        passed: false,
        reason: '信号类型未定义'
      };
    }

    const allowedTypes = ['LONG', 'BUY'];

    if (!allowedTypes.includes(signalType)) {
      console.log(`   ❌ 信号类型不支持: ${signalType} (仅支持 LONG/BUY)`);
      return {
        passed: false,
        reason: `信号类型不支持: ${signalType} (当前仅支持 LONG/BUY)`
      };
    }

    console.log(`   ✅ 信号类型检查通过: ${signalType}`);
    return { passed: true };
  }

  /**
   * 🆕 检查跟单策略 - 判断是否应该跟这个信号
   */
  async checkFollowStrategy(userConfig, signal) {
    const strategy = userConfig.follow_strategy || 'TOP_SIGNALS';
    const tokenSymbol = signal.token_symbol;
    const confidence = signal.confidence_score || signal.confidence || 0;

    console.log(`   📊 跟单策略检查: ${strategy}, Token: ${tokenSymbol}, 置信度: ${confidence}%`);
    console.log(`   🔍 DEBUG: whitelisted_tokens type=${typeof userConfig.whitelisted_tokens}, value=${JSON.stringify(userConfig.whitelisted_tokens)}`);

    // 策略 1: 跟踪所有信号
    if (strategy === 'ALL') {
      console.log(`   ✅ 策略: 跟踪所有信号`);
      return { passed: true };
    }

    // 策略 2: 只跟白名单代币
    if (strategy === 'WHITELIST') {
      let whitelist = [];
      try {
        if (!userConfig.whitelisted_tokens) {
          whitelist = [];
        } else if (Array.isArray(userConfig.whitelisted_tokens)) {
          // 已经是数组
          whitelist = userConfig.whitelisted_tokens;
        } else if (typeof userConfig.whitelisted_tokens === 'string') {
          // 尝试解析 JSON
          const trimmed = userConfig.whitelisted_tokens.trim();
          if (trimmed.startsWith('[')) {
            whitelist = JSON.parse(trimmed);
          } else {
            // 不是 JSON 数组，可能是逗号分隔的字符串
            whitelist = trimmed.split(',').map(t => t.trim()).filter(t => t.length > 0);
          }
        }
      } catch (e) {
        console.error(`   ❌ 解析白名单失败:`, e);
        console.error(`   原始值:`, userConfig.whitelisted_tokens);
        return { passed: false, reason: '白名单配置错误' };
      }

      console.log(`   🔍 DEBUG: Parsed whitelist=${JSON.stringify(whitelist)}, length=${whitelist.length}`);

      // 🔧 修复: 空数组表示跟所有代币
      if (whitelist.length === 0) {
        console.log(`   ✅ 白名单为空，跟踪所有代币`);
        return { passed: true };
      }

      const inWhitelist = whitelist.includes(tokenSymbol);
      if (inWhitelist) {
        console.log(`   ✅ ${tokenSymbol} 在白名单中: ${whitelist.join(', ')}`);
        return { passed: true };
      } else {
        return {
          passed: false,
          reason: `${tokenSymbol} 不在白名单中 (仅跟: ${whitelist.join(', ')})`
        };
      }
    }

    // 策略 3: 只跟高分信号
    if (strategy === 'TOP_SIGNALS') {
      const minConfidence = parseFloat(userConfig.min_confidence || 80);

      if (confidence >= minConfidence) {
        console.log(`   ✅ 置信度 ${confidence}% >= ${minConfidence}%`);
        return { passed: true };
      } else {
        return {
          passed: false,
          reason: `置信度 ${confidence}% 低于阈值 ${minConfidence}%`
        };
      }
    }

    // 策略 4: Twitter KOL 跟单 (完全信任 KOL,不检查置信度)
    if (strategy === 'TWITTER_KOL') {
      // 🔧 修复1: 只接受 Twitter 信号
      const isTwitterSignal = signal.signal_id && signal.signal_id.startsWith('TWSIG-');

      if (!isTwitterSignal) {
        return {
          passed: false,
          reason: 'TWITTER_KOL 策略仅跟踪 Twitter 信号'
        };
      }

      // 🔧 修复2: 拒绝超过20分钟的旧信号
      const signalCreatedAt = new Date(signal.created_at);
      const now = new Date();
      const ageMinutes = (now - signalCreatedAt) / 1000 / 60;

      if (ageMinutes > 20) {
        console.log(`   ⏭️ 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟限制)`);
        return {
          passed: false,
          reason: `信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟)`
        };
      }

      console.log(`   ✅ 策略: Twitter KOL 跟单 (无置信度限制, 信号年龄: ${ageMinutes.toFixed(1)} 分钟)`);
      return { passed: true };
    }

    // 策略 5: 融合模式 (同时支持 Alpha 信号 + KOL 信号)
    if (strategy === 'FUSION') {
      // FUSION 模式: KOL 信号直接通过,Alpha 信号需要检查置信度
      // 判断信号来源: 如果 signal_id 以 TWSIG- 开头,说明是 Twitter 信号
      const isTwitterSignal = signal.signal_id && signal.signal_id.startsWith('TWSIG-');

      if (isTwitterSignal) {
        // 🔧 修复: Twitter 信号也要检查时间
        const signalCreatedAt = new Date(signal.created_at);
        const now = new Date();
        const ageMinutes = (now - signalCreatedAt) / 1000 / 60;

        if (ageMinutes > 20) {
          console.log(`   ⏭️ Twitter 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟限制)`);
          return {
            passed: false,
            reason: `Twitter 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟)`
          };
        }

        console.log(`   ✅ 策略: FUSION - Twitter 信号直接通过 (信号年龄: ${ageMinutes.toFixed(1)} 分钟)`);
        return { passed: true };
      } else {
        // Alpha 信号需要检查置信度
        const minConfidence = parseFloat(userConfig.min_confidence || 70);
        if (confidence >= minConfidence) {
          console.log(`   ✅ 策略: FUSION - Alpha 信号置信度 ${confidence}% >= ${minConfidence}%`);
          return { passed: true };
        } else {
          return {
            passed: false,
            reason: `FUSION - Alpha 信号置信度 ${confidence}% 低于阈值 ${minConfidence}%`
          };
        }
      }
    }

    // 策略 6: Telegram 群组信号跟单
    if (strategy === 'TELEGRAM') {
      // 只接受 Telegram 信号 (signal_id 以 TGSIG- 开头)
      const isTelegramSignal = signal.signal_id && signal.signal_id.startsWith('TGSIG-');

      if (!isTelegramSignal) {
        return {
          passed: false,
          reason: 'TELEGRAM 策略仅跟踪 Telegram 群组信号'
        };
      }

      // 检查信号年龄 (拒绝超过20分钟的旧信号)
      const signalCreatedAt = new Date(signal.created_at);
      const now = new Date();
      const ageMinutes = (now - signalCreatedAt) / 1000 / 60;

      if (ageMinutes > 20) {
        console.log(`   ⏭️ Telegram 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟限制)`);
        return {
          passed: false,
          reason: `Telegram 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟)`
        };
      }

      console.log(`   ✅ 策略: Telegram 群组跟单 (无置信度限制, 信号年龄: ${ageMinutes.toFixed(1)} 分钟)`);
      return { passed: true };
    }

    // 策略 7: Meme Coin 策略 (Twitter/Telegram 合约地址信号)
    if (strategy === 'MEME') {
      // 只接受 Telegram 或 Twitter 信号
      const isTelegramSignal = signal.signal_id && signal.signal_id.startsWith('TGSIG-');
      const isTwitterSignal = signal.signal_id && signal.signal_id.startsWith('TWSIG-');

      if (!isTelegramSignal && !isTwitterSignal) {
        return {
          passed: false,
          reason: 'MEME 策略仅跟踪 Twitter/Telegram 合约信号'
        };
      }

      // 检查信号年龄 (拒绝超过20分钟的旧信号)
      const signalCreatedAt = new Date(signal.created_at);
      const now = new Date();
      const ageMinutes = (now - signalCreatedAt) / 1000 / 60;

      if (ageMinutes > 20) {
        const source = isTelegramSignal ? 'Telegram' : 'Twitter';
        console.log(`   ⏭️ ${source} 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟限制)`);
        return {
          passed: false,
          reason: `${source} 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过20分钟)`
        };
      }

      const source = isTelegramSignal ? 'Telegram' : 'Twitter';
      console.log(`   ✅ 策略: MEME Coin 跟单 (${source}, 信任 KOL, 信号年龄: ${ageMinutes.toFixed(1)} 分钟)`);
      return { passed: true };
    }

    // 策略 8: Range Trading 策略 (低买高卖)
    if (strategy === 'RANGE') {
      // 只接受 RANGE 信号
      const isRangeSignal = signal.signal_id && signal.signal_id.startsWith('RANGE-');
      const isRangeSource = signal.signal_source && signal.signal_source.startsWith('RANGE_');

      if (!isRangeSignal && !isRangeSource) {
        return {
          passed: false,
          reason: 'RANGE 策略仅跟踪 Range Trading 信号'
        };
      }

      // 检查信号年龄 (拒绝超过4小时的旧信号)
      console.log(`   🔍 DEBUG created_at: value=${signal.created_at}, type=${typeof signal.created_at}, isDate=${signal.created_at instanceof Date}`);

      // 确保 created_at 存在
      if (!signal.created_at) {
        console.log(`   ⚠️ Signal missing created_at field, using current time`);
        console.log(`   ✅ 策略: Range Trading (低买高卖, 信号年龄: 0.0 分钟)`);
        return { passed: true };
      }

      const signalCreatedAt = new Date(signal.created_at);
      const now = new Date();
      const ageMinutes = (now - signalCreatedAt) / 1000 / 60;

      console.log(`   🔍 DEBUG: signalCreatedAt=${signalCreatedAt}, now=${now}, ageMinutes=${ageMinutes}`);

      // 检查计算结果是否有效
      if (isNaN(ageMinutes)) {
        console.log(`   ⚠️ Failed to calculate signal age, invalid date: ${signal.created_at}`);
        console.log(`   ✅ 策略: Range Trading (低买高卖, 信号年龄: unknown)`);
        return { passed: true };
      }

      if (ageMinutes > 240) { // 4 小时
        console.log(`   ⏭️ Range 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过4小时限制)`);
        return {
          passed: false,
          reason: `Range 信号过旧: ${ageMinutes.toFixed(1)} 分钟 (超过4小时)`
        };
      }

      console.log(`   ✅ 策略: Range Trading (低买高卖, 信号年龄: ${ageMinutes.toFixed(1)} 分钟)`);
      return { passed: true };
    }

    // 未知策略，默认拒绝
    return { passed: false, reason: `未知策略: ${strategy}` };
  }

  /**
   * 🆕 从区块链实时查询 USDT 余额 (支持多个稳定币合约)
   * @param {string} walletAddress - 钱包地址
   * @param {string} chain - 链名称 (BSC, Base)
   * @returns {Promise<number>} USDT 总余额
   */
  async getUSDTBalanceOnChain(walletAddress, chain) {
    try {
      const usdtAddresses = this.usdtContracts[chain];

      if (!usdtAddresses) {
        throw new Error(`不支持的链: ${chain}`);
      }

      // 🔧 查询所有稳定币合约并加总（使用 rpcProvider 带重试）
      let totalBalance = 0;
      const decimals = chain === 'BSC' ? 18 : 6;

      for (const usdtAddress of usdtAddresses) {
        try {
          const balance = await this.rpcProvider.callContract(
            chain,
            usdtAddress,
            this.erc20ABI,
            'balanceOf',
            [walletAddress]
          );
          const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));

          if (balanceFormatted > 0) {
            console.log(`   💰 稳定币 ${usdtAddress.substring(0, 10)}...: ${balanceFormatted} (${decimals}位小数)`);
            totalBalance += balanceFormatted;
          }
        } catch (err) {
          console.error(`   ⚠️ 查询合约 ${usdtAddress} 失败: ${err.message}`);
        }
      }

      console.log(`   💵 稳定币总余额: ${totalBalance}`);

      return totalBalance;

    } catch (error) {
      console.error(`   ❌ 查询 USDT 余额失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🆕 从区块链实时查询 Gas 余额 (BNB/ETH)
   * @param {string} walletAddress - 钱包地址
   * @param {string} chain - 链名称 (BSC, Base)
   * @returns {Promise<number>} Gas 余额
   */
  async getGasBalanceOnChain(walletAddress, chain) {
    try {
      // 使用 rpcProvider 带重试的余额查询
      const balance = await this.rpcProvider.getBalance(chain, walletAddress);
      const balanceFormatted = parseFloat(ethers.formatEther(balance));

      return balanceFormatted;

    } catch (error) {
      console.error(`   ❌ 查询 Gas 余额失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查余额 (🆕 P1.1: 实时链上查询)
   */
  async checkBalance(userId, tradeAmount, chain) {
    try {
      const userConfig = await this.getUserConfig(userId);

      // 🆕 实时查询链上余额
      const walletAddress = userConfig.wallet_address;

      if (!walletAddress) {
        return {
          passed: false,
          reason: '钱包地址未配置'
        };
      }

      console.log(`   🔍 实时查询链上余额: ${walletAddress.substring(0, 10)}... (${chain})`);

      // 并行查询 USDT 和 Gas 余额
      const [usdtBalance, gasBalance] = await Promise.all([
        this.getUSDTBalanceOnChain(walletAddress, chain),
        this.getGasBalanceOnChain(walletAddress, chain)
      ]);

      // 直接使用链上余额（链上余额已经反映了所有交易）
      const availableBalance = usdtBalance;

      console.log(`   💰 USDT 余额: $${usdtBalance.toFixed(2)}`);
      console.log(`   ⛽ Gas 余额: ${gasBalance.toFixed(6)} ${chain === 'BSC' ? 'BNB' : 'ETH'}`);

      console.log(`   📊 所需余额: USDT $${tradeAmount.toFixed(2)} (交易金额), Gas由BNB支付`);

      // 检查 USDT 余额 (只需要交易金额,Gas由BNB/ETH支付)
      if (availableBalance < tradeAmount) {
        return {
          passed: false,
          reason: `USDT余额不足: 可用 $${availableBalance.toFixed(2)}, 需要 $${tradeAmount.toFixed(2)}`
        };
      }

      // 检查 Gas 余额 (BSC 需要 BNB, Base 需要 ETH)
      const minGasBalance = chain === 'BSC' ? 0.01 : 0.005; // BNB/ETH

      if (gasBalance < minGasBalance) {
        return {
          passed: false,
          reason: `Gas 余额不足: ${gasBalance.toFixed(6)} ${chain === 'BSC' ? 'BNB' : 'ETH'}, 需要至少 ${minGasBalance}`
        };
      }

      return { passed: true };

    } catch (error) {
      console.error(`   ❌ 余额检查失败: ${error.message}`);
      return { passed: false, reason: `余额检查失败: ${error.message}` };
    }
  }

  /**
   * 🆕 检查是否已持有该代币 (Twitter Signal 专用去重)
   * @param {string} userId - 用户ID
   * @param {string} tokenSymbol - 代币符号
   * @returns {Promise<Object>} - { passed: boolean, reason: string }
   */
  async checkDuplicatePosition(userId, tokenSymbol) {
    try {
      const existing = await DatabaseService.query(`
        SELECT execution_id, token_symbol
        FROM auto_trade_positions
        WHERE user_id = ? AND token_symbol = ? AND status = 'HOLDING'
      `, [userId, tokenSymbol]);

      if (existing.length > 0) {
        console.log(`   ⏭️ 已持有 ${tokenSymbol}, 拒绝重复买入`);
        return {
          passed: false,
          reason: `Already holding ${tokenSymbol} (position ID: ${existing[0].execution_id})`
        };
      }

      return { passed: true };

    } catch (error) {
      return { passed: false, reason: `重复持仓检查失败: ${error.message}` };
    }
  }

  /**
   * 检查持仓限制
   * 🔧 修复: 从 auto_trade_positions 表查询实际持仓数量
   */
  async checkPositionLimits(userId, userConfig) {
    try {
      const currentPositions = await DatabaseService.query(`
        SELECT COUNT(*) as count
        FROM auto_trade_positions
        WHERE user_id = ? AND status = 'HOLDING'
      `, [userId]);

      const positionCount = currentPositions[0].count;
      const maxPositions = userConfig.max_positions || this.defaults.maxPositions;

      console.log(`   📊 当前持仓: ${positionCount}/${maxPositions}`);

      if (positionCount >= maxPositions) {
        return {
          passed: false,
          reason: `持仓已满: ${positionCount}/${maxPositions}`
        };
      }

      return { passed: true };

    } catch (error) {
      return { passed: false, reason: `持仓检查失败: ${error.message}` };
    }
  }

  /**
   * 检查单日亏损
   */
  async checkDailyLoss(userId, userConfig) {
    try {
      // ✅ 修复: 使用今日交易总入场金额作为分母，而不是 usdt_balance
      const todayTrades = await DatabaseService.query(`
        SELECT
          COALESCE(SUM(profit_loss_usdt), 0) as daily_pnl,
          COALESCE(SUM(entry_amount_usdt), 0) as total_entry_amount
        FROM auto_trade_executions
        WHERE user_id = ?
        AND status = 'EXITED'
        AND DATE(exit_executed_at) = CURDATE()
      `, [userId]);

      const dailyPnL = parseFloat(todayTrades[0].daily_pnl || 0);
      const totalEntryAmount = parseFloat(todayTrades[0].total_entry_amount || 0);

      // 如果今天没有交易，跳过熔断检查
      if (totalEntryAmount <= 0) {
        console.log(`   ℹ️ 今日无交易，跳过熔断检查`);
        return { passed: true };
      }

      const dailyPnLPercent = (dailyPnL / totalEntryAmount) * 100;
      const lossLimit = userConfig.daily_loss_limit || this.defaults.dailyLossLimit;

      console.log(`   📉 今日盈亏: ${dailyPnL > 0 ? '+' : ''}$${dailyPnL.toFixed(2)} / $${totalEntryAmount.toFixed(2)} = ${dailyPnLPercent > 0 ? '+' : ''}${dailyPnLPercent.toFixed(2)}%`);

      if (dailyPnLPercent <= lossLimit) {
        // 检查是否已经处于暂停状态，避免重复触发熔断
        const isPaused = userConfig.paused_until && new Date(userConfig.paused_until) > new Date();

        if (!isPaused) {
          // 仅在未暂停时触发熔断
          await this.triggerCircuitBreaker(userId, `Daily loss limit reached: ${dailyPnLPercent.toFixed(2)}%`);
          console.log(`   ⚠️ 触发熔断: 单日亏损 ${dailyPnLPercent.toFixed(2)}% (亏损 $${dailyPnL.toFixed(2)} / 入场 $${totalEntryAmount.toFixed(2)})`);
        } else {
          console.log(`   ⏸️ 已处于暂停状态，跳过重复熔断`);
        }

        return {
          passed: false,
          reason: `单日亏损限制: ${dailyPnLPercent.toFixed(2)}% <= ${lossLimit}%`
        };
      }

      return { passed: true };

    } catch (error) {
      return { passed: false, reason: `亏损检查失败: ${error.message}` };
    }
  }

  /**
   * 标准化代币符号 (去除交易对后缀)
   * 例如: LABUSDT -> LAB, BTCUSDT -> BTC
   */
  normalizeTokenSymbol(tokenSymbol) {
    if (!tokenSymbol) return tokenSymbol;

    // 去除常见交易对后缀
    const suffixes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB'];

    for (const suffix of suffixes) {
      if (tokenSymbol.endsWith(suffix) && tokenSymbol.length > suffix.length) {
        const normalized = tokenSymbol.slice(0, -suffix.length);
        // 确保去除后缀后还有内容
        if (normalized.length > 0) {
          return normalized;
        }
      }
    }

    return tokenSymbol; // 没有匹配的后缀,返回原值
  }

  /**
   * 检查白名单
   */
  async checkWhitelist(tokenSymbol, chain, userConfig) {
    try {
      // 标准化token symbol (去除USDT等后缀)
      const normalizedSymbol = this.normalizeTokenSymbol(tokenSymbol);

      // 1. 检查用户黑名单
      const blacklist = userConfig.blacklisted_tokens ?
        JSON.parse(userConfig.blacklisted_tokens) : [];

      // 对黑名单和白名单中的每个token也进行标准化比较
      const normalizedBlacklist = blacklist.map(t => this.normalizeTokenSymbol(t));

      if (normalizedBlacklist.includes(normalizedSymbol)) {
        return {
          passed: false,
          reason: `代币在黑名单中: ${tokenSymbol} (${normalizedSymbol})`
        };
      }

      // 2. 检查用户白名单 (如果配置了)
      let whitelist = null;
      if (userConfig.whitelisted_tokens) {
        if (Array.isArray(userConfig.whitelisted_tokens)) {
          whitelist = userConfig.whitelisted_tokens;
        } else if (typeof userConfig.whitelisted_tokens === 'string') {
          whitelist = JSON.parse(userConfig.whitelisted_tokens);
        }
      }

      if (whitelist && whitelist.length > 0) {
        const normalizedWhitelist = whitelist.map(t => this.normalizeTokenSymbol(t));

        if (!normalizedWhitelist.includes(normalizedSymbol)) {
          return {
            passed: false,
            reason: `${tokenSymbol} 不在白名单中 (仅跟: ${whitelist.join(', ')})`
          };
        }
      }

      // 3. 检查系统白名单 (流动性白名单)
      // 🧪 [测试模式] 临时跳过流动性白名单检查
      console.log(`   ⚠️ [测试模式] 跳过流动性白名单检查: ${tokenSymbol}`);
      // const isWhitelisted = await LiquidityMonitor.isWhitelisted(tokenSymbol, chain);
      //
      // if (!isWhitelisted) {
      //   return {
      //     passed: false,
      //     reason: `代币未通过流动性验证: ${tokenSymbol}`
      //   };
      // }
      //
      // console.log(`   ✅ 白名单检查通过: ${tokenSymbol}`);

      return { passed: true };

    } catch (error) {
      return { passed: false, reason: `白名单检查失败: ${error.message}` };
    }
  }

  /**
   * 检查流动性
   */
  async checkLiquidity(tokenSymbol, chain, userConfig) {
    try {
      const minLiquidity = userConfig.min_liquidity_required || this.defaults.minLiquidityRequired;

      const liquidity = await LiquidityMonitor.getLiquidity(tokenSymbol, chain);

      if (!liquidity || !liquidity.isEligible) {
        return {
          passed: false,
          reason: `流动性不足: ${tokenSymbol}`
        };
      }

      if (liquidity.tvl < minLiquidity) {
        return {
          passed: false,
          reason: `流动性 $${liquidity.tvl.toLocaleString()} < 要求 $${minLiquidity.toLocaleString()}`
        };
      }

      console.log(`   ✅ 流动性充足: $${liquidity.tvl.toLocaleString()}`);

      return { passed: true };

    } catch (error) {
      return { passed: false, reason: `流动性检查失败: ${error.message}` };
    }
  }

  /**
   * 检查单代币仓位占比
   */
  async checkConcentration(userId, tokenSymbol, tradeAmount, userConfig) {
    try {
      const usdtBalance = parseFloat(userConfig.usdt_balance || 100);
      const maxPercent = userConfig.single_token_max_percent || this.defaults.singleTokenMaxPercent;

      // 查询该代币已有持仓
      const existingPosition = await DatabaseService.query(`
        SELECT COALESCE(SUM(entry_amount_usdt), 0) as existing_amount
        FROM auto_trade_executions
        WHERE user_id = ? AND token_symbol = ? AND status IN ('CONFIRMED', 'HOLDING')
      `, [userId, tokenSymbol]);

      const existingAmount = parseFloat(existingPosition[0].existing_amount || 0);
      const totalAmount = existingAmount + tradeAmount;
      const totalPercent = (totalAmount / usdtBalance) * 100;

      console.log(`   📌 ${tokenSymbol} 仓位: ${totalPercent.toFixed(2)}% (限制 ${maxPercent}%)`);

      if (totalPercent > maxPercent) {
        return {
          passed: false,
          reason: `单代币仓位过大: ${totalPercent.toFixed(2)}% > ${maxPercent}%`
        };
      }

      return { passed: true };

    } catch (error) {
      return { passed: false, reason: `仓位检查失败: ${error.message}` };
    }
  }

  /**
   * 触发熔断
   */
  async triggerCircuitBreaker(userId, reason) {
    try {
      const pausedUntil = new Date(Date.now() + this.defaults.circuitBreakerDuration);

      await DatabaseService.query(`
        UPDATE auto_trade_config
        SET paused_until = ?, pause_reason = ?
        WHERE user_id = ?
      `, [pausedUntil, reason, userId]);

      console.log(`   ⚠️ 熔断触发: ${userId} 暂停至 ${pausedUntil.toLocaleTimeString()}`);
      console.log(`   原因: ${reason}`);

      // TODO: 发送通知给用户

    } catch (error) {
      console.error(`   ❌ 熔断失败: ${error.message}`);
    }
  }

  /**
   * 检查连续失败 (用于熔断判断)
   */
  async checkConsecutiveFailures(userId) {
    try {
      const recentTrades = await DatabaseService.query(`
        SELECT status, exit_type
        FROM auto_trade_executions
        WHERE user_id = ?
        AND status = 'EXITED'
        ORDER BY exit_executed_at DESC
        LIMIT 10
      `, [userId]);

      let consecutiveLosses = 0;

      for (const trade of recentTrades) {
        if (trade.exit_type === 'STOP_LOSS') {
          consecutiveLosses++;
        } else {
          break; // 中断连续计数
        }
      }

      console.log(`   📊 连续止损: ${consecutiveLosses} 次`);

      if (consecutiveLosses >= this.defaults.circuitBreakerThreshold) {
        await this.triggerCircuitBreaker(
          userId,
          `${consecutiveLosses} consecutive stop losses`
        );

        return { triggered: true, count: consecutiveLosses };
      }

      return { triggered: false, count: consecutiveLosses };

    } catch (error) {
      console.error(`   ❌ 失败检查错误: ${error.message}`);
      return { triggered: false, count: 0 };
    }
  }

  /**
   * 解除暂停
   */
  async unpauseUser(userId) {
    try {
      await DatabaseService.query(`
        UPDATE auto_trade_config
        SET paused_until = NULL, pause_reason = NULL
        WHERE user_id = ?
      `, [userId]);

      console.log(`   ✅ 已解除暂停: ${userId}`);

      return { success: true };

    } catch (error) {
      console.error(`   ❌ 解除暂停失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取用户配置
   */
  async getUserConfig(userId) {
    const result = await DatabaseService.query(`
      SELECT * FROM auto_trade_config
      WHERE user_id = ?
    `, [userId]);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * 获取所有启用自动交易的用户 (支持多策略)
   * 返回格式: [{ user_id, strategy_id, strategy_name, wallet_address, trade_amount, ... }]
   *
   * 🔧 修复: 根据信号类型过滤策略,避免重复执行
   * - TGSIG-* (Telegram): 仅 TELEGRAM 和 FUSION 策略
   * - TWSIG-* (Twitter): 仅 TWITTER_KOL 和 FUSION 策略
   * - 其他信号: 仅 TOP_SIGNALS, WHITELIST 和 FUSION 策略
   *
   * 🔧 修复2: 如果信号包含 strategy_id，直接使用该策略，避免错误匹配
   */
  async getEnabledUsers(signalId, signalStrategyId = null) {
    try {
      // 🔧 修复: 如果信号指定了 strategy_id，直接使用该策略
      if (signalStrategyId) {
        console.log(`   📊 信号指定策略ID: ${signalStrategyId}`);

        const strategies = await DatabaseService.query(`
          SELECT
            c.strategy_id,
            c.user_id,
            c.strategy_name,
            c.wallet_address,
            c.enabled,
            c.max_trade_amount as trade_amount,
            c.max_slippage_percent as max_slippage,
            c.supported_chains,
            c.follow_strategy,
            c.whitelisted_tokens,
            c.min_confidence,
            c.stop_loss_percent,
            c.take_profit_percent,
            c.max_positions,
            c.stop_loss_mode
          FROM auto_trade_config c
          WHERE c.strategy_id = ?
          AND c.is_active = 1
          AND (c.paused_until IS NULL OR c.paused_until < NOW())
        `, [signalStrategyId]);

        console.log(`   ✅ 找到 ${strategies.length} 个匹配的启用策略`);
        return strategies;
      }

      // 🔧 根据信号ID前缀确定策略过滤条件
      let strategyFilter = '';
      let signalSource = 'UNKNOWN';

      if (signalId && signalId.startsWith('TGSIG-')) {
        // Telegram signal: TELEGRAM, FUSION and MEME strategies should follow
        strategyFilter = "AND c.follow_strategy IN ('TELEGRAM', 'FUSION', 'MEME')";
        signalSource = 'Telegram';
      } else if (signalId && signalId.startsWith('TWSIG-')) {
        // Twitter signal: TWITTER_KOL, FUSION and MEME strategies should follow
        strategyFilter = "AND c.follow_strategy IN ('TWITTER_KOL', 'FUSION', 'MEME')";
        signalSource = 'Twitter';
      } else if (signalId && signalId.startsWith('RANGE-')) {
        // Range Trading signal: only RANGE strategy should follow
        strategyFilter = "AND c.follow_strategy IN ('RANGE')";
        signalSource = 'Range Trading';
      } else {
        // Other signals (Alpha/Binance): only TOP_SIGNALS, WHITELIST and FUSION strategies should follow
        strategyFilter = "AND c.follow_strategy IN ('TOP_SIGNALS', 'WHITELIST', 'FUSION', 'ALL')";
        signalSource = 'Alpha/Binance';
      }

      const strategies = await DatabaseService.query(`
        SELECT
          c.strategy_id,
          c.user_id,
          c.strategy_name,
          c.wallet_address,
          c.enabled,
          c.max_trade_amount as trade_amount,
          c.max_slippage_percent as max_slippage,
          c.supported_chains,
          c.follow_strategy,
          c.whitelisted_tokens,
          c.min_confidence,
          c.stop_loss_percent,
          c.take_profit_percent,
          c.max_positions,
          c.stop_loss_mode
        FROM auto_trade_config c
        WHERE c.is_active = 1
        AND (c.paused_until IS NULL OR c.paused_until < NOW())
        ${strategyFilter}
      `);

      console.log(`   📊 信号来源: ${signalSource} (${signalId || 'N/A'})`);
      console.log(`   ✅ 找到 ${strategies.length} 个匹配的启用策略`);

      // 🔍 DEBUG: 输出每个策略的信息
      strategies.forEach(s => {
        console.log(`   🔍 [策略] ID=${s.strategy_id}, 名称=${s.strategy_name}, 类型=${s.follow_strategy}, 用户=${s.user_id.substring(0, 20)}...`);
      });

      // 统计用户数 (去重)
      const uniqueUsers = [...new Set(strategies.map(s => s.user_id))];
      console.log(`   👥 涉及 ${uniqueUsers.length} 个不同用户`);

      return strategies;

    } catch (error) {
      console.error(`   ❌ 查询策略失败: ${error.message}`);
      return [];
    }
  }
}

module.exports = new RiskController();
