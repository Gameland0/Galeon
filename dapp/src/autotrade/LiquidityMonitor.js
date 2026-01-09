/**
 * 流动性监控服务
 * 功能:
 * 1. 查询 DexScreener API 获取流动性数据
 * 2. 评估流动性是否充足
 * 3. 更新白名单数据库
 * 4. 定时任务每小时检查
 */

const axios = require('axios');
const DatabaseService = require('../databaseService');

/**
 * 标准化代币符号：去掉交易对后缀
 * SOONUSDT → SOON
 * LABBTC → LAB
 * ETHUSDT → ETH
 */
function normalizeTokenSymbol(symbol) {
  if (!symbol) return symbol;
  // 去掉常见交易对后缀
  return symbol.replace(/(USDT|BTC|ETH|BNB|BUSD)$/, '');
}

class LiquidityMonitor {
  constructor() {
    this.dexScreenerAPI = 'https://api.dexscreener.com/latest/dex';

    // 流动性评估标准
    this.standards = {
      EXCELLENT: { tvl: 500000, volume24h: 1000000, risk: 'LOW' },
      GOOD: { tvl: 200000, volume24h: 100000, risk: 'LOW' },
      USABLE: { tvl: 50000, volume24h: 20000, risk: 'MEDIUM' },
    };

    console.log('✅ LiquidityMonitor initialized');
  }

  /**
   * 查询代币流动性数据
   * @param {string} tokenSymbol - 代币符号
   * @param {string} chain - 链名称 (BSC, Base)
   * @param {string} contractAddress - 合约地址 (来自 Binance Alpha API)
   */
  async checkLiquidity(tokenSymbol, chain, contractAddress = null) {
    try {
      const baseSymbol = normalizeTokenSymbol(tokenSymbol);
      console.log(`\n🔍 检查流动性: ${tokenSymbol} → ${baseSymbol} (${chain})`);

      // ✅ 直接使用数据库白名单 (数据来自 Binance Alpha API,更准确)
      console.log(`   📊 使用 Binance Alpha 白名单数据`);

      const whitelistData = await DatabaseService.query(`
        SELECT * FROM auto_trade_token_whitelist
        WHERE token_symbol = ? AND chain = ?
        LIMIT 1
      `, [baseSymbol, chain]);

      if (whitelistData.length === 0) {
        console.log(`   ❌ ${baseSymbol} 不在白名单中`);
        return null;
      }

      const data = whitelistData[0];

      const liquidityData = {
        tokenSymbol,
        chain,
        dexName: data.dex_name || 'unknown',
        poolAddress: data.pool_address,
        contractAddress: contractAddress || data.contract_address,
        tvl: parseFloat(data.liquidity_usd) || 0,
        volume24h: parseFloat(data.volume_24h_usd) || 0,
        priceUsd: parseFloat(data.price_usd) || 0,
        holders: data.total_holders || 0,
      };

      console.log(`   DEX: ${liquidityData.dexName}`);
      console.log(`   TVL: $${liquidityData.tvl.toLocaleString()}`);
      console.log(`   24h Volume: $${liquidityData.volume24h.toLocaleString()}`);

      // 评估流动性等级
      const assessment = this.assessLiquidity(liquidityData);

      return {
        ...liquidityData,
        ...assessment
      };

    } catch (error) {
      console.error(`❌ 流动性检查失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 评估流动性等级
   */
  assessLiquidity(data) {
    const { tvl, volume24h } = data;

    if (tvl >= this.standards.EXCELLENT.tvl && volume24h >= this.standards.EXCELLENT.volume24h) {
      return {
        isEligible: true,
        riskLevel: 'LOW',
        grade: 'EXCELLENT',
        reason: `流动性优秀: TVL $${(tvl / 1000).toFixed(0)}K, Volume $${(volume24h / 1000000).toFixed(1)}M`
      };
    }

    if (tvl >= this.standards.GOOD.tvl && volume24h >= this.standards.GOOD.volume24h) {
      return {
        isEligible: true,
        riskLevel: 'LOW',
        grade: 'GOOD',
        reason: `流动性良好: TVL $${(tvl / 1000).toFixed(0)}K, Volume $${(volume24h / 1000).toFixed(0)}K`
      };
    }

    if (tvl >= this.standards.USABLE.tvl && volume24h >= this.standards.USABLE.volume24h) {
      return {
        isEligible: true,
        riskLevel: 'MEDIUM',
        grade: 'USABLE',
        reason: `流动性可用: TVL $${(tvl / 1000).toFixed(0)}K, 仅适合小额交易 (<$50)`
      };
    }

    return {
      isEligible: false,
      riskLevel: 'HIGH',
      grade: 'INSUFFICIENT',
      reason: `流动性不足: TVL $${(tvl / 1000).toFixed(0)}K, Volume $${(volume24h / 1000).toFixed(0)}K`
    };
  }

  /**
   * 更新白名单数据库
   */
  async updateWhitelist(tokenSymbol, chain) {
    try {
      const liquidityData = await this.checkLiquidity(tokenSymbol, chain);

      if (!liquidityData) {
        console.log(`   ⏭️ 跳过数据库更新 (无数据)`);
        return;
      }

      // 插入或更新白名单
      await DatabaseService.query(`
        INSERT INTO auto_trade_token_whitelist
        (token_symbol, chain, contract_address, dex_name, pool_address,
         liquidity_usd, volume_24h_usd, price_usd,
         is_eligible, risk_level, eligibility_reason, last_checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          dex_name = VALUES(dex_name),
          pool_address = VALUES(pool_address),
          liquidity_usd = VALUES(liquidity_usd),
          volume_24h_usd = VALUES(volume_24h_usd),
          price_usd = VALUES(price_usd),
          is_eligible = VALUES(is_eligible),
          risk_level = VALUES(risk_level),
          eligibility_reason = VALUES(eligibility_reason),
          last_checked_at = VALUES(last_checked_at)
      `, [
        liquidityData.tokenSymbol,
        liquidityData.chain,
        liquidityData.contractAddress,
        liquidityData.dexName,
        liquidityData.poolAddress,
        liquidityData.tvl,
        liquidityData.volume24h,
        liquidityData.priceUsd,
        liquidityData.isEligible,
        liquidityData.riskLevel,
        liquidityData.reason
      ]);

      console.log(`   ✅ 白名单已更新: ${tokenSymbol} (${liquidityData.grade})`);

      return liquidityData;

    } catch (error) {
      console.error(`❌ 白名单更新失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 批量更新所有 DEX 代币的白名单
   * ✅ 使用 Binance Alpha API 数据 + DexScreener API 补充 pool_address
   */
  async updateAllDEXTokens() {
    console.log('\n📊 开始批量更新 DEX 代币白名单 (Binance Alpha + DexScreener)...');

    try {
      // 1. 从 BinanceAlphaService 获取所有 DEX 代币
      const BinanceAlphaService = require('../BinanceAlphaService');
      const allTokens = await BinanceAlphaService.getAllAlphaTokensIncludingDEX();

      const dexTokens = allTokens.filter(t => t.source === 'DEX');
      console.log(`   找到 ${dexTokens.length} 个 DEX 代币`);

      // 2. 使用 Binance Alpha 数据 + DexScreener 补充
      const DexScreenerService = require('../DexScreenerService');
      let eligible = 0;
      let ineligible = 0;

      for (const token of dexTokens) {
        // 基础数据来自 Binance Alpha
        const liquidityData = {
          tokenSymbol: token.symbol,
          chain: token.chain,
          contractAddress: token.contractAddress || null,
          dexName: token.dex || 'unknown',
          poolAddress: token.poolAddress || null,
          tvl: parseFloat(token.liquidity) || 0,
          volume24h: parseFloat(token.volume24h) || 0,
          priceUsd: parseFloat(token.price) || 0,
        };

        // 🔧 如果有合约地址但没有 pool_address，从 DexScreener 获取完整池子信息
        let txnBuys24h = 0;
        let txnSells24h = 0;
        let txnTotal24h = 0;
        let pairCreatedAt = null;

        if (liquidityData.contractAddress && !liquidityData.poolAddress) {
          try {
            const poolInfo = await DexScreenerService.getPoolInfo(token.symbol, liquidityData.contractAddress);
            if (poolInfo && poolInfo.pairAddress) {
              liquidityData.poolAddress = poolInfo.pairAddress;
              liquidityData.dexName = poolInfo.dexId || liquidityData.dexName;
              txnBuys24h = poolInfo.txnBuys24h;
              txnSells24h = poolInfo.txnSells24h;
              txnTotal24h = poolInfo.txnTotal24h;
              pairCreatedAt = poolInfo.pairCreatedAt;

              // 如果 Binance Alpha 数据不准确，使用 DexScreener 的数据
              if (poolInfo.liquidity > 0) liquidityData.tvl = poolInfo.liquidity;
              if (poolInfo.volume24h > 0) liquidityData.volume24h = poolInfo.volume24h;

              console.log(`      ✅ DexScreener: ${token.symbol} - Pool=${poolInfo.pairAddress.slice(0, 10)}..., Txns=${poolInfo.txnTotal24h}`);
            }
          } catch (err) {
            // 不阻断流程，继续处理其他token
            console.log(`      ⚠️ DexScreener failed for ${token.symbol}: ${err.message}`);
          }
        }

        // 评估流动性
        const assessment = this.assessLiquidity(liquidityData);

        // 插入或更新数据库
        await DatabaseService.query(`
          INSERT INTO auto_trade_token_whitelist
          (token_symbol, chain, contract_address, dex_name, pool_address,
           liquidity_usd, volume_24h_usd, price_usd,
           is_eligible, risk_level, eligibility_reason,
           txn_buys_24h, txn_sells_24h, txn_total_24h, pair_created_at,
           last_checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            dex_name = VALUES(dex_name),
            pool_address = VALUES(pool_address),
            liquidity_usd = VALUES(liquidity_usd),
            volume_24h_usd = VALUES(volume_24h_usd),
            price_usd = VALUES(price_usd),
            is_eligible = VALUES(is_eligible),
            risk_level = VALUES(risk_level),
            eligibility_reason = VALUES(eligibility_reason),
            txn_buys_24h = VALUES(txn_buys_24h),
            txn_sells_24h = VALUES(txn_sells_24h),
            txn_total_24h = VALUES(txn_total_24h),
            pair_created_at = VALUES(pair_created_at),
            last_checked_at = VALUES(last_checked_at)
        `, [
          liquidityData.tokenSymbol,
          liquidityData.chain,
          liquidityData.contractAddress,
          liquidityData.dexName,
          liquidityData.poolAddress,
          liquidityData.tvl,
          liquidityData.volume24h,
          liquidityData.priceUsd,
          assessment.isEligible,
          assessment.riskLevel,
          assessment.reason,
          txnBuys24h,
          txnSells24h,
          txnTotal24h,
          pairCreatedAt
        ]);

        if (assessment.isEligible) {
          eligible++;
        } else {
          ineligible++;
        }
      }

      console.log(`\n✅ 批量更新完成 (基于 Binance Alpha 数据):`);
      console.log(`   - 合格: ${eligible} 个`);
      console.log(`   - 不合格: ${ineligible} 个`);

      return { total: dexTokens.length, eligible, ineligible };

    } catch (error) {
      console.error(`❌ 批量更新失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取流动性数据 (供其他服务调用)
   */
  async getLiquidity(tokenSymbol, chain) {
    try {
      const baseSymbol = normalizeTokenSymbol(tokenSymbol);

      // 先从数据库读取缓存
      const cached = await DatabaseService.query(`
        SELECT * FROM auto_trade_token_whitelist
        WHERE token_symbol = ? AND chain = ?
        AND last_checked_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      `, [baseSymbol, chain]);

      if (cached.length > 0) {
        console.log(`   📦 使用缓存流动性数据: ${baseSymbol}`);
        return {
          tvl: parseFloat(cached[0].liquidity_usd),
          volume24h: parseFloat(cached[0].volume_24h_usd),
          isEligible: cached[0].is_eligible,
          riskLevel: cached[0].risk_level
        };
      }

      // 缓存过期，重新查询
      console.log(`   🔄 刷新流动性数据: ${baseSymbol}`);
      const fresh = await this.updateWhitelist(baseSymbol, chain);

      if (!fresh) {
        throw new Error('Failed to fetch liquidity data');
      }

      return {
        tvl: fresh.tvl,
        volume24h: fresh.volume24h,
        isEligible: fresh.isEligible,
        riskLevel: fresh.riskLevel
      };

    } catch (error) {
      console.error(`❌ 获取流动性失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查代币是否在白名单中
   */
  async isWhitelisted(tokenSymbol, chain) {
    try {
      console.log(`   🔍 [isWhitelisted] 查询: ${tokenSymbol} (${chain})`);

      const result = await DatabaseService.query(`
        SELECT is_eligible, volume_24h_usd, liquidity_usd FROM auto_trade_token_whitelist
        WHERE token_symbol = ? AND chain = ?
      `, [tokenSymbol, chain]);

      console.log(`   📊 [isWhitelisted] 查询结果:`, result);

      if (result.length > 0 && result[0].is_eligible === 1) {
        console.log(`   ✅ [isWhitelisted] ${tokenSymbol} 在白名单中且已启用`);
        return true;
      } else {
        console.log(`   ❌ [isWhitelisted] ${tokenSymbol} 不在白名单或未启用`);
        return false;
      }
    } catch (error) {
      console.error(`❌ 检查白名单失败: ${error.message}`);
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LiquidityMonitor();
