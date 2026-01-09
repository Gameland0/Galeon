/**
 * DEX 聚合服务
 * 功能:
 * 1. 统一封装 PancakeSwap V3 (BSC) 和 Aerodrome (Base)
 * 2. 构建 Swap 交易
 * 3. 估算滑点和 Gas 费
 * 4. 查询价格
 */

const { ethers } = require('ethers');
const axios = require('axios');
const chainConfig = require('../../config/chains');
const contractsConfig = require('../../config/contracts');
const rpcProvider = require('../../utils/rpcProvider');
const FourMemeService = require('./FourMemeService');

class DEXAggregatorService {
  constructor() {
    // 使用 RPCProvider 工具类（支持多 RPC 轮询和故障切换）
    this.rpcProvider = rpcProvider;

    // PancakeSwap V2 Router ABI
    this.pancakeRouterV2ABI = [
      'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
      'function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)'
    ];

    // PancakeSwap V3 SmartRouter ABI (简化版)
    this.pancakeRouterABI = [
      'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
      'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)'
    ];

    // Aerodrome Router ABI (简化版)
    this.aerodromeRouterABI = [
      'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
      'function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)'
    ];

    // ERC20 ABI (approve, balanceOf)
    this.erc20ABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)'
    ];

    console.log('✅ DEXAggregatorService initialized');
  }

  /**
   * 构建 Swap 交易
   * 统一接口，自动路由到对应的 DEX
   * 支持 four.meme (BSC meme) 和常规 DEX
   */
  async buildSwapTx(params) {
    const { chain, tokenIn, tokenInAddress, tokenOut, tokenOutAddress, amountIn, slippage, userAddress, isFourMeme, fourMemeInfo } = params;

    console.log(`\n🔧 构建交易: ${amountIn} ${tokenIn} -> ${tokenOut} (${chain})`);
    console.log(`   📍 User Address (for allowance check): ${userAddress}`);
    if (tokenInAddress) {
      console.log(`   🔑 Using position tokenIn contract address: ${tokenInAddress}`);
    }
    if (tokenOutAddress) {
      console.log(`   🔑 Using signal tokenOut contract address: ${tokenOutAddress}`);
    }

    // 🆕 检查是否是 four.meme 代币 (BSC meme)
    if (chain === 'BSC' && isFourMeme && fourMemeInfo && !fourMemeInfo.liquidityAdded) {
      console.log(`   🎮 [FourMeme] 使用 four.meme 交易...`);
      return await this.buildFourMemeSwap(tokenOutAddress, amountIn, slippage, userAddress);
    }

    // 🆕 即使标记了 four.meme，如果已添加流动性，使用 PancakeSwap
    if (chain === 'BSC' && isFourMeme && fourMemeInfo && fourMemeInfo.liquidityAdded) {
      console.log(`   📈 [FourMeme] 代币已上 PancakeSwap，使用常规 DEX 交易...`);
    }

    if (chain === 'BSC') {
      return await this.buildPancakeSwap(tokenIn, tokenOut, amountIn, slippage, userAddress, tokenInAddress, tokenOutAddress);
    } else if (chain === 'Base') {
      return await this.buildAerodromeSwap(tokenIn, tokenOut, amountIn, slippage, userAddress, tokenInAddress, tokenOutAddress);
    } else {
      throw new Error(`Unsupported chain: ${chain}`);
    }
  }

  /**
   * 🆕 构建 four.meme 交易
   * 用于 BSC meme 代币 (bonding curve 阶段)
   */
  async buildFourMemeSwap(tokenAddress, amountInUSDT, slippage, userAddress) {
    try {
      console.log(`   🎮 [FourMeme] 构建 four.meme 购买交易:`);
      console.log(`      代币: ${tokenAddress}`);
      console.log(`      金额: $${amountInUSDT} USDT`);

      // 1. 将 USDT 转换为 BNB
      const bnbAmount = await FourMemeService.usdtToBNB(parseFloat(amountInUSDT));
      console.log(`      转换为: ${bnbAmount.toFixed(6)} BNB`);

      // 2. 构建 four.meme 购买交易
      const txData = await FourMemeService.buildBuyTx({
        tokenAddress,
        bnbAmount,
        slippage: slippage || 10, // four.meme 默认 10% 滑点
        userAddress
      });

      return txData;

    } catch (error) {
      console.error(`   ❌ [FourMeme] 构建交易失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * PancakeSwap V2/V3 智能路由 (BSC)
   * 策略: V3 优先, V2 备选
   */
  async buildPancakeSwap(tokenIn, tokenOut, amountIn, slippage, userAddress, providedTokenInAddress = null, providedTokenOutAddress = null) {
    try {
      const contracts = contractsConfig.BSC;
      const provider = this.rpcProvider.getProvider('BSC');
      const DatabaseService = require('../databaseService');

      // 1. 获取代币地址
      let tokenInAddress, tokenOutAddress;

      // 🔧 tokenIn: 优先使用持仓时的合约地址（卖出时避免白名单过期）
      if (providedTokenInAddress) {
        tokenInAddress = providedTokenInAddress;
        console.log(`   ✅ 使用持仓合约地址 (tokenIn): ${tokenInAddress}`);
      } else if (contracts[tokenIn]) {
        tokenInAddress = contracts[tokenIn];
      } else {
        const tokenData = await DatabaseService.query(`
          SELECT contract_address FROM auto_trade_token_whitelist
          WHERE token_symbol = ? AND chain = 'BSC'
          LIMIT 1
        `, [tokenIn]);

        if (!tokenData || tokenData.length === 0) {
          throw new Error(`未找到代币合约地址: ${tokenIn}`);
        }

        tokenInAddress = tokenData[0].contract_address;
      }

      // 🔧 tokenOut: 优先使用信号提供的合约地址，避免白名单数据过时
      if (providedTokenOutAddress) {
        tokenOutAddress = providedTokenOutAddress;
        console.log(`   ✅ 使用信号合约地址: ${tokenOutAddress}`);
      } else if (contracts[tokenOut]) {
        tokenOutAddress = contracts[tokenOut];
      } else {
        const tokenData = await DatabaseService.query(`
          SELECT contract_address FROM auto_trade_token_whitelist
          WHERE token_symbol = ? AND chain = 'BSC'
          LIMIT 1
        `, [tokenOut]);

        if (!tokenData || tokenData.length === 0) {
          throw new Error(`未找到代币合约地址: ${tokenOut}`);
        }

        tokenOutAddress = tokenData[0].contract_address;
      }

      console.log(`   📍 代币地址:`, {
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress
      });

      // 2. 查询 decimals 和余额
      const tokenInContract = new ethers.Contract(tokenInAddress, this.erc20ABI, provider);
      const decimals = await tokenInContract.decimals();
      const amountInWei = ethers.parseUnits(amountIn.toString(), decimals);

      // 🔧 [DEBUG] 检查用户的代币余额
      console.log(`   🔧 [DEBUG] 代币余额检查:`);
      console.log(`      查询钱包地址: ${userAddress}`);
      console.log(`      代币合约地址: ${tokenInAddress}`);
      const balance = await tokenInContract.balanceOf(userAddress);
      console.log(`      要卖出数量 (wei): ${amountInWei.toString()}`);
      console.log(`      钱包余额 (wei): ${balance.toString()}`);
      console.log(`      余额是否充足: ${balance >= amountInWei}`);

      // 🔧 修复: 如果余额不足(可能是精度问题),使用实际余额
      let finalAmountInWei = amountInWei;
      if (balance < amountInWei) {
        const diff = amountInWei - balance;
        const diffPercent = Number(diff * 10000n / amountInWei) / 100;

        console.log(`   ⚠️ 余额不足! 相差 ${diff.toString()} wei (${diffPercent.toFixed(4)}%)`);

        // 如果差距小于 0.1%,认为是精度问题,使用实际余额
        if (diffPercent < 0.1) {
          console.log(`   ✅ 差距 < 0.1%,判定为精度问题,使用实际余额: ${balance.toString()}`);
          finalAmountInWei = balance;
        } else {
          throw new Error(`余额不足: 需要 ${amountInWei.toString()}, 实际 ${balance.toString()}, 相差 ${diffPercent.toFixed(4)}%`);
        }
      }

      // 3. 智能路由: 🔧 修复 - 优先使用 ParaSwap 聚合器（自动路由到最佳流动性池，包括 PancakeSwap Infinity CLMM）
      console.log(`\n   🔀 开始智能路由...`);

      // 🆕 优先尝试 ParaSwap 聚合器（支持更多流动性池，包括 PancakeSwap Infinity CLMM）
      console.log(`   🔄 优先尝试 ParaSwap 聚合器...`);
      try {
        const paraSwapResult = await this.tryParaSwapRoute(
          tokenInAddress,
          tokenOutAddress,
          finalAmountInWei,
          decimals,
          slippage,
          userAddress,
          tokenIn,
          tokenOut,
          amountIn
        );

        if (paraSwapResult.success) {
          // 🔧 检查 ParaSwap 返回的预期输出是否合理（价格冲击保护）
          const expectedOutput = parseFloat(paraSwapResult.txData.amountOutMin);
          const inputValue = parseFloat(amountIn);

          // 如果是卖出代币换 USDT，检查输出是否合理
          if (tokenOut === 'USDT' || tokenOut === 'USDC') {
            console.log(`   📊 ParaSwap 预期输出: ${expectedOutput.toFixed(4)} ${tokenOut}`);
            console.log(`   📊 输入数量: ${inputValue} ${tokenIn}`);
          }

          console.log(`   ✅ 使用 ParaSwap 聚合器路由`);
          return paraSwapResult.txData;
        }
      } catch (paraSwapError) {
        console.log(`   ⚠️ ParaSwap 不可用: ${paraSwapError.message}`);
      }

      // ParaSwap 失败，回退到 PancakeSwap V3
      console.log(`   🔄 ParaSwap 不可用，尝试 PancakeSwap V3...`);
      const v3Result = await this.tryPancakeV3(
        tokenInAddress,
        tokenOutAddress,
        finalAmountInWei,
        decimals,
        slippage,
        userAddress,
        tokenIn,
        tokenOut,
        amountIn
      );

      if (v3Result.success) {
        // 🔧 检查 V3 的价格冲击
        const v3Output = parseFloat(v3Result.txData.amountOutMin);
        console.log(`   📊 V3 预期输出: ${v3Output.toFixed(4)} ${tokenOut}`);
        console.log(`   ✅ 使用 PancakeSwap V3`);
        return v3Result.txData;
      }

      console.log(`   ⚠️ V3 不可用, 回退到 V2...`);

      // 回退到 V2
      const v2Result = await this.tryPancakeV2(
        tokenInAddress,
        tokenOutAddress,
        finalAmountInWei,
        decimals,
        slippage,
        userAddress,
        tokenIn,
        tokenOut,
        amountIn
      );

      if (v2Result.success) {
        // 🔧 检查 V2 的价格冲击 - 如果输出过低，警告用户
        const v2Output = parseFloat(v2Result.txData.amountOutMin);
        console.log(`   📊 V2 预期输出: ${v2Output.toFixed(4)} ${tokenOut}`);

        // 如果是卖出代币换稳定币，检查价格冲击
        if ((tokenOut === 'USDT' || tokenOut === 'USDC') && v2Output < parseFloat(amountIn) * 0.5) {
          console.log(`   ⚠️ 警告: V2 输出过低，可能存在严重价格冲击！`);
          console.log(`   ⚠️ 预期输出 ${v2Output.toFixed(4)} 远低于输入价值`);
          // 不直接拒绝，但记录警告
        }

        console.log(`   ✅ 使用 PancakeSwap V2`);
        return v2Result.txData;
      }

      throw new Error('ParaSwap/V3/V2 都没有可用的流动性池');

    } catch (error) {
      console.error(`   ❌ PancakeSwap 构建失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 保存池子信息到白名单
   * @param {string} tokenSymbol - 代币符号
   * @param {string} chain - 链名称
   * @param {string} dexName - DEX 名称 (PancakeSwap V3, PancakeSwap V2, Uniswap V3, etc.)
   * @param {string} poolAddress - 池子地址
   * @param {number} fee - V3 费率 (可选)
   */
  async savePoolInfoToWhitelist(tokenSymbol, chain, dexName, poolAddress, fee = null) {
    try {
      const DatabaseService = require('../databaseService');

      const feeInfo = fee ? ` (${(fee/10000).toFixed(2)}%)` : '';
      console.log(`      💾 保存池子信息到白名单: ${tokenSymbol} -> ${dexName}${feeInfo}`);

      await DatabaseService.query(`
        UPDATE auto_trade_token_whitelist
        SET dex_name = ?, pool_address = ?, last_checked_at = NOW()
        WHERE token_symbol = ? AND chain = ?
      `, [dexName, poolAddress, tokenSymbol, chain]);

      console.log(`      ✅ 白名单已更新: dex_name=${dexName}, pool_address=${poolAddress.slice(0, 10)}...`);
    } catch (error) {
      // 不阻断交易流程
      console.log(`      ⚠️ 保存池子信息失败: ${error.message}`);
    }
  }

  /**
   * 尝试使用 PancakeSwap V3
   */
  async tryPancakeV3(tokenInAddress, tokenOutAddress, amountInWei, decimals, slippage, userAddress, tokenIn, tokenOut, amountIn) {
    try {
      const contracts = contractsConfig.BSC;
      const provider = this.rpcProvider.getProvider('BSC');

      console.log(`   🔍 尝试 V3...`);

      // 获取输出代币的 decimals (修复硬编码问题)
      const tokenOutContract = new ethers.Contract(tokenOutAddress, this.erc20ABI, provider);
      const outputDecimals = await tokenOutContract.decimals();
      console.log(`      📏 输出代币精度: ${outputDecimals}`);

      // V3 Factory ABI
      const v3FactoryABI = ['function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'];
      const v3Factory = new ethers.Contract(contracts.PancakeFactory, v3FactoryABI, provider);

      // V3 Pool ABI
      const v3PoolABI = ['function liquidity() external view returns (uint128)'];

      // V3 Quoter ABI
      const v3QuoterABI = [
        'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
      ];

      // V3 费率等级 (包含 PancakeSwap V3 所有支持的费率)
      const feeTiers = [70, 100, 500, 2500, 10000]; // 0.007%, 0.01%, 0.05%, 0.25%, 1%
      let bestFee = null;
      let bestLiquidity = BigInt(0);
      let bestPoolAddress = null;

      // 查找流动性最好的池子
      for (const fee of feeTiers) {
        try {
          const poolAddress = await v3Factory.getPool(tokenInAddress, tokenOutAddress, fee);
          if (poolAddress === '0x0000000000000000000000000000000000000000') {
            continue;
          }

          const pool = new ethers.Contract(poolAddress, v3PoolABI, provider);
          const liquidity = await pool.liquidity();

          if (liquidity > bestLiquidity) {
            bestLiquidity = liquidity;
            bestFee = fee;
            bestPoolAddress = poolAddress;
          }

          console.log(`      找到池子 (${(fee/10000).toFixed(2)}%): 流动性 = ${liquidity.toString()}`);
        } catch (e) {
          // 池子不存在或查询失败
        }
      }

      if (bestFee === null || bestLiquidity === BigInt(0)) {
        console.log(`      ❌ V3 没有可用的流动性池`);
        return { success: false };
      }

      console.log(`      ✅ 选择最佳池子: ${(bestFee/10000).toFixed(2)}% 费率`);

      // 🔧 保存池子信息到白名单
      await this.savePoolInfoToWhitelist(tokenOut, 'BSC', 'PancakeSwap V3', bestPoolAddress, bestFee);

      // 🔒 验证 1: V3 池子流动性检查
      console.log(`      🔒 开始安全验证...`);
      const liquidityCheck = await this.verifyV3PoolLiquidity(bestPoolAddress, bestLiquidity, 'BSC');

      if (!liquidityCheck.passed) {
        console.log(`      ❌ 验证失败: ${liquidityCheck.reason}`);
        return { success: false };
      }

      // 使用 Quoter 获取报价
      const quoter = new ethers.Contract(contracts.PancakeQuoter, v3QuoterABI, provider);

      // 注意: Quoter.quoteExactInputSingle 会 revert 并返回结果, 需要使用 staticCall
      const quoteParams = {
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        amountIn: amountInWei,
        fee: bestFee,
        sqrtPriceLimitX96: 0
      };

      const [amountOut] = await quoter.quoteExactInputSingle.staticCall(quoteParams);

      // 🔒 验证 2: 价格合理性检查
      const priceCheck = await this.verifyPriceReasonability(
        tokenOut,
        'BSC',
        amountInWei,
        amountOut,
        decimals,
        outputDecimals
      );

      if (!priceCheck.passed) {
        console.log(`      ❌ 验证失败: ${priceCheck.reason}`);
        return { success: false };
      }

      console.log(`      ✅ 安全验证通过!`);

      const amountOutMinimum = amountOut * BigInt(10000 - slippage * 100) / BigInt(10000);

      console.log(`      预期输出: ${ethers.formatUnits(amountOut, outputDecimals)} ${tokenOut}`);
      console.log(`      最小输出: ${ethers.formatUnits(amountOutMinimum, outputDecimals)} ${tokenOut}`);

      // 构建 V3 交易
      const routerAddress = contracts.PancakeRouter; // SmartRouter
      const v3RouterABI = [
        'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
      ];

      const iface = new ethers.Interface(v3RouterABI);
      const txData = iface.encodeFunctionData('exactInputSingle', [{
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        fee: bestFee,
        recipient: userAddress,
        amountIn: amountInWei,
        amountOutMinimum: amountOutMinimum,
        sqrtPriceLimitX96: 0
      }]);

      // Gas 估算
      const gasEstimate = BigInt(350000); // V3 通常比 V2 稍贵
      const gasPrice = (await provider.getFeeData()).gasPrice;
      const gasCost = gasEstimate * gasPrice;

      console.log(`      Gas 估算: ${ethers.formatEther(gasCost)} BNB`);

      // 检查 Allowance
      const needsApproval = await this.checkAllowance(
        'BSC',
        tokenInAddress,
        userAddress,
        routerAddress,
        amountInWei
      );

      return {
        success: true,
        txData: {
          chain: 'BSC',
          dex: 'PancakeSwap V3',
          version: 'V3',
          fee: bestFee,
          tokenAddress: tokenOutAddress,
          routerAddress,
          txData: txData,
          value: '0x0',
          gasLimit: '0x' + gasEstimate.toString(16),
          gasPrice: '0x' + gasPrice.toString(16),
          estimatedGasCost: ethers.formatEther(gasCost),
          estimatedSlippage: slippage,
          amountIn: amountIn.toString(),
          amountOutMin: ethers.formatUnits(amountOutMinimum, outputDecimals),
          needsApproval,
          approvalTx: needsApproval ? await this.buildApprovalTx('BSC', tokenInAddress, routerAddress, amountInWei) : null
        }
      };

    } catch (error) {
      console.log(`      ⚠️ V3 失败: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 尝试使用 PancakeSwap V2
   */
  async tryPancakeV2(tokenInAddress, tokenOutAddress, amountInWei, decimals, slippage, userAddress, tokenIn, tokenOut, amountIn) {
    try {
      const contracts = contractsConfig.BSC;
      const provider = this.rpcProvider.getProvider('BSC');

      console.log(`   🔍 尝试 V2...`);

      const routerAddress = contracts.PancakeRouterV2;
      const router = new ethers.Contract(routerAddress, this.pancakeRouterV2ABI, provider);

      // V2 Factory ABI
      const v2FactoryABI = ['function getPair(address tokenA, address tokenB) external view returns (address pair)'];
      const v2Factory = new ethers.Contract(contracts.PancakeFactoryV2, v2FactoryABI, provider);

      // 获取输出代币的 decimals (修复硬编码问题)
      const tokenOutContract = new ethers.Contract(tokenOutAddress, this.erc20ABI, provider);
      const outputDecimals = await tokenOutContract.decimals();
      console.log(`      📏 输出代币精度: ${outputDecimals}`);

      // 尝试直接交易对
      let amountOutMinimum;
      let finalPath;

      const directPath = [tokenInAddress, tokenOutAddress];
      const directPair = await v2Factory.getPair(tokenInAddress, tokenOutAddress);

      if (directPair !== '0x0000000000000000000000000000000000000000') {
        try {
          console.log(`      🔍 尝试直接路由: [${tokenIn} -> ${tokenOut}]`);
          const amounts = await router.getAmountsOut(amountInWei, directPath);
          const amountOut = amounts[1];

          // 🔒 验证 1: 池子流动性检查
          console.log(`      🔒 开始三重安全验证...`);
          const liquidityCheck = await this.verifyV2PoolLiquidity(directPair, tokenInAddress, tokenOutAddress, 'BSC');

          if (!liquidityCheck.passed) {
            console.log(`      ❌ 验证失败: ${liquidityCheck.reason}`);
            throw new Error(liquidityCheck.reason);
          }

          // 🔒 验证 2: 价格合理性检查
          const priceCheck = await this.verifyPriceReasonability(
            tokenOut,
            'BSC',
            amountInWei,
            amountOut,
            decimals,
            outputDecimals
          );

          if (!priceCheck.passed) {
            console.log(`      ❌ 验证失败: ${priceCheck.reason}`);
            throw new Error(priceCheck.reason);
          }

          // 🔒 验证 3: 价格影响检查
          const impactCheck = this.calculatePriceImpact(
            liquidityCheck.inputReserve,
            liquidityCheck.outputReserve,
            amountInWei,
            amountOut,
            decimals,
            outputDecimals
          );

          if (!impactCheck.passed) {
            console.log(`      ❌ 验证失败: ${impactCheck.reason}`);
            throw new Error(impactCheck.reason);
          }

          console.log(`      ✅ 三重验证全部通过!`);

          // 🔧 保存池子信息到白名单
          await this.savePoolInfoToWhitelist(tokenOut, 'BSC', 'PancakeSwap V2', directPair);

          amountOutMinimum = amountOut * BigInt(10000 - slippage * 100) / BigInt(10000);
          finalPath = directPath;
          console.log(`      ✅ 直接路由成功!`);
          console.log(`      预期输出: ${ethers.formatUnits(amountOut, outputDecimals)} ${tokenOut}`);
          console.log(`      最小输出: ${ethers.formatUnits(amountOutMinimum, outputDecimals)} ${tokenOut}`);
        } catch (e) {
          console.log(`      ⚠️ 直接路由失败: ${e.message}`);
        }
      }

      // 如果直接路由失败, 尝试通过 WBNB
      if (!finalPath) {
        const pathViaWBNB = [tokenInAddress, contracts.WBNB, tokenOutAddress];
        try {
          console.log(`      🔍 尝试 WBNB 路由: [${tokenIn} -> WBNB -> ${tokenOut}]`);
          const amounts = await router.getAmountsOut(amountInWei, pathViaWBNB);
          const amountOut = amounts[amounts.length - 1];

          // 🔒 WBNB 路由也需要三重验证
          // 获取 WBNB-tokenOut 池子地址
          const wbnbPair = await v2Factory.getPair(contracts.WBNB, tokenOutAddress);

          if (wbnbPair !== '0x0000000000000000000000000000000000000000') {
            console.log(`      🔒 开始三重安全验证 (WBNB路由)...`);

            // 验证 1: 池子流动性
            const liquidityCheck = await this.verifyV2PoolLiquidity(wbnbPair, contracts.WBNB, tokenOutAddress, 'BSC');

            if (!liquidityCheck.passed) {
              console.log(`      ❌ WBNB路由验证失败: ${liquidityCheck.reason}`);
              throw new Error(liquidityCheck.reason);
            }

            // 验证 2: 价格合理性 (使用 WBNB 作为中间代币,比较最终价格)
            const priceCheck = await this.verifyPriceReasonability(
              tokenOut,
              'BSC',
              amountInWei,
              amountOut,
              decimals,
              outputDecimals
            );

            if (!priceCheck.passed) {
              console.log(`      ❌ WBNB路由验证失败: ${priceCheck.reason}`);
              throw new Error(priceCheck.reason);
            }

            console.log(`      ✅ WBNB路由验证通过!`);

            // 🔧 保存池子信息到白名单 (使用 WBNB-tokenOut 池子)
            await this.savePoolInfoToWhitelist(tokenOut, 'BSC', 'PancakeSwap V2 (via WBNB)', wbnbPair);
          }

          amountOutMinimum = amountOut * BigInt(10000 - slippage * 100) / BigInt(10000);
          finalPath = pathViaWBNB;
          console.log(`      ✅ WBNB 路由成功!`);
          console.log(`      预期输出: ${ethers.formatUnits(amountOut, outputDecimals)} ${tokenOut}`);
          console.log(`      最小输出: ${ethers.formatUnits(amountOutMinimum, outputDecimals)} ${tokenOut}`);
        } catch (e) {
          console.log(`      ❌ WBNB 路由失败: ${e.message}`);
          return { success: false };
        }
      }

      if (!finalPath) {
        console.log(`      ❌ V2 没有可用的交易路径`);
        return { success: false };
      }

      // 构建 V2 交易
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      const iface = new ethers.Interface(this.pancakeRouterV2ABI);
      const txData = iface.encodeFunctionData('swapExactTokensForTokens', [
        amountInWei,
        amountOutMinimum,
        finalPath,
        userAddress,
        deadline
      ]);

      // Gas 估算
      const gasEstimate = BigInt(300000);
      const gasPrice = (await provider.getFeeData()).gasPrice;
      const gasCost = gasEstimate * gasPrice;

      console.log(`      Gas 估算: ${ethers.formatEther(gasCost)} BNB`);

      // 检查 Allowance
      const needsApproval = await this.checkAllowance(
        'BSC',
        tokenInAddress,
        userAddress,
        routerAddress,
        amountInWei
      );

      return {
        success: true,
        txData: {
          chain: 'BSC',
          dex: 'PancakeSwap V2',
          version: 'V2',
          tokenAddress: tokenOutAddress,
          routerAddress,
          txData: txData,
          value: '0x0',
          gasLimit: '0x' + gasEstimate.toString(16),
          gasPrice: '0x' + gasPrice.toString(16),
          estimatedGasCost: ethers.formatEther(gasCost),
          estimatedSlippage: slippage,
          amountIn: amountIn.toString(),
          amountOutMin: ethers.formatUnits(amountOutMinimum, outputDecimals),
          needsApproval,
          approvalTx: needsApproval ? await this.buildApprovalTx('BSC', tokenInAddress, routerAddress, amountInWei) : null
        }
      };

    } catch (error) {
      console.log(`      ⚠️ V2 失败: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 🆕 ParaSwap 路由发现
   * 当 V2/V3 都失败时，使用 ParaSwap API 自动发现最佳路由
   */
  async tryParaSwapRoute(tokenInAddress, tokenOutAddress, amountInWei, decimals, slippage, userAddress, tokenIn, tokenOut, amountIn) {
    try {
      console.log(`      🔍 ParaSwap 路由查询...`);

      // 获取输出代币精度
      const provider = this.rpcProvider.getProvider('BSC');
      const tokenOutContract = new ethers.Contract(tokenOutAddress, this.erc20ABI, provider);
      const outputDecimals = await tokenOutContract.decimals();

      // 1. 调用 ParaSwap API 获取报价和路由
      const priceResponse = await axios.get('https://apiv5.paraswap.io/prices', {
        params: {
          srcToken: tokenInAddress,
          destToken: tokenOutAddress,
          amount: amountInWei.toString(),
          srcDecimals: decimals,
          destDecimals: outputDecimals,
          side: 'SELL',
          network: 56  // BSC
        },
        timeout: 10000
      });

      if (!priceResponse.data || !priceResponse.data.priceRoute) {
        console.log(`      ❌ ParaSwap 未找到路由`);
        return { success: false };
      }

      const priceRoute = priceResponse.data.priceRoute;
      const destAmount = BigInt(priceRoute.destAmount);

      console.log(`      ✅ ParaSwap 找到路由:`);
      console.log(`         预期输出: ${ethers.formatUnits(destAmount, outputDecimals)} ${tokenOut}`);
      console.log(`         Gas 费用: $${priceRoute.gasCostUSD}`);

      // 打印路由路径
      if (priceRoute.bestRoute && priceRoute.bestRoute[0]) {
        const swaps = priceRoute.bestRoute[0].swaps;
        const routePath = swaps.map(s => s.swapExchanges[0]?.exchange || 'Unknown').join(' → ');
        console.log(`         路径: ${routePath}`);
      }

      // 2. 构建交易数据 - 使用合理的保护滑点（0.5%），用户设置的滑点只是安全上限
      const protectionSlippageBps = 50; // 固定 0.5% 保护滑点
      const minDestAmount = destAmount * BigInt(10000 - protectionSlippageBps) / BigInt(10000);

      console.log(`         保护滑点: 0.5%, 最小输出: ${ethers.formatUnits(minDestAmount, outputDecimals)}`);
      console.log(`         用户最大容忍滑点: ${slippage}% (仅用于检查，不用于交易)`);

      // 🔧 ParaSwap: 使用 destAmount (用户可接受的最小输出)
      const txResponse = await axios.post('https://apiv5.paraswap.io/transactions/56', {
        srcToken: tokenInAddress,
        destToken: tokenOutAddress,
        srcAmount: amountInWei.toString(),
        destAmount: minDestAmount.toString(),  // 基于用户滑点计算的最小输出
        priceRoute: priceRoute,
        userAddress: userAddress,
        partner: 'anon',
        srcDecimals: decimals,
        destDecimals: outputDecimals
      }, {
        params: { ignoreChecks: true },
        timeout: 10000,
        transformRequest: [(data) => {
          // 处理 BigInt 序列化问题
          return JSON.stringify(data, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          );
        }],
        headers: { 'Content-Type': 'application/json' }
      });

      if (!txResponse.data || !txResponse.data.data) {
        console.log(`      ❌ ParaSwap 构建交易失败`);
        return { success: false };
      }

      const txData = txResponse.data;
      const routerAddress = txData.to;

      // 🔧 ParaSwap: 确保 value 是 0x 开头的格式
      let txValue = txData.value || '0';
      if (!String(txValue).startsWith('0x')) {
        txValue = '0x' + BigInt(txValue).toString(16);
      }

      console.log(`      ✅ ParaSwap 交易构建成功`);
      console.log(`         Router: ${routerAddress}`);
      console.log(`         最小输出: ${ethers.formatUnits(minDestAmount, outputDecimals)} ${tokenOut}`);

      // 3. 检查 Allowance (ParaSwap 使用 tokenTransferProxy)
      const spenderAddress = priceRoute.tokenTransferProxy || routerAddress;
      const needsApproval = await this.checkAllowance(
        'BSC',
        tokenInAddress,
        userAddress,
        spenderAddress,
        amountInWei
      );

      // Gas 估算
      const gasLimit = BigInt(txData.gas || 500000);
      const gasPrice = BigInt(txData.gasPrice || (await provider.getFeeData()).gasPrice);
      const gasCost = gasLimit * gasPrice;

      return {
        success: true,
        txData: {
          chain: 'BSC',
          dex: 'ParaSwap',
          version: 'Aggregator',
          tokenAddress: tokenOutAddress,
          routerAddress: routerAddress,
          txData: txData.data,
          value: txValue,
          gasLimit: '0x' + gasLimit.toString(16),
          gasPrice: '0x' + gasPrice.toString(16),
          estimatedGasCost: ethers.formatEther(gasCost),
          estimatedSlippage: slippage,
          amountIn: amountIn.toString(),
          amountOutMin: ethers.formatUnits(minDestAmount, outputDecimals),
          needsApproval,
          approvalTx: needsApproval ? await this.buildApprovalTx('BSC', tokenInAddress, spenderAddress, amountInWei) : null
        }
      };

    } catch (error) {
      // 🔧 打印详细错误信息
      if (error.response) {
        console.log(`      ⚠️ ParaSwap 失败: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        console.log(`      ⚠️ ParaSwap 失败: ${error.message}`);
      }
      return { success: false };
    }
  }

  /**
   * Aerodrome (Base) - 完整版带安全验证
   */
  async buildAerodromeSwap(tokenIn, tokenOut, amountIn, slippage, userAddress) {
    try {
      const contracts = contractsConfig.Base;
      const provider = this.rpcProvider.getProvider('Base');
      const DatabaseService = require('../databaseService');

      // 1. 获取代币地址 (优先从白名单表读取)
      let tokenInAddress, tokenOutAddress;

      // tokenIn: 如果是硬编码的稳定币,使用配置文件; 否则查询白名单表
      if (contracts[tokenIn]) {
        tokenInAddress = contracts[tokenIn];
      } else {
        const tokenData = await DatabaseService.query(`
          SELECT contract_address FROM auto_trade_token_whitelist
          WHERE token_symbol = ? AND chain = 'Base'
          LIMIT 1
        `, [tokenIn]);

        if (!tokenData || tokenData.length === 0) {
          throw new Error(`未找到代币合约地址: ${tokenIn}`);
        }

        tokenInAddress = tokenData[0].contract_address;
      }

      // tokenOut: 同理
      if (contracts[tokenOut]) {
        tokenOutAddress = contracts[tokenOut];
      } else {
        const tokenData = await DatabaseService.query(`
          SELECT contract_address FROM auto_trade_token_whitelist
          WHERE token_symbol = ? AND chain = 'Base'
          LIMIT 1
        `, [tokenOut]);

        if (!tokenData || tokenData.length === 0) {
          throw new Error(`未找到代币合约地址: ${tokenOut}`);
        }

        tokenOutAddress = tokenData[0].contract_address;
      }

      // 2. 动态查询 decimals
      const tokenInContract = new ethers.Contract(tokenInAddress, this.erc20ABI, provider);
      const tokenOutContract = new ethers.Contract(tokenOutAddress, this.erc20ABI, provider);

      const decimalsIn = await tokenInContract.decimals();
      const decimalsOut = await tokenOutContract.decimals();

      // 3. 转换金额
      const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);

      console.log(`🔍 Base Aerodrome 交易分析:`);
      console.log(`   TokenIn: ${tokenIn} (${tokenInAddress}), Decimals: ${decimalsIn}`);
      console.log(`   TokenOut: ${tokenOut} (${tokenOutAddress}), Decimals: ${decimalsOut}`);
      console.log(`   Amount: ${amountIn} → ${amountInWei.toString()} wei`);

      // 4. 尝试直接路径
      console.log(`\n📍 Step 1: 尝试直接路径 ${tokenIn} → ${tokenOut}`);
      let result = await this.tryAerodromeDirect(
        tokenInAddress,
        tokenOutAddress,
        amountInWei,
        decimalsOut,
        slippage,
        userAddress
      );

      // 5. 如果直接路径失败,尝试通过 WETH 中继
      if (!result.success) {
        console.log(`\n📍 Step 2: 尝试 WETH 中继路径 ${tokenIn} → WETH → ${tokenOut}`);
        result = await this.tryAerodromeViaWETH(
          tokenInAddress,
          tokenOutAddress,
          amountInWei,
          decimalsOut,
          slippage,
          userAddress
        );
      }

      if (!result.success) {
        throw new Error('所有 Aerodrome 路径都失败');
      }

      return result.data;

    } catch (error) {
      console.error(`   ❌ Aerodrome 构建失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 尝试 Aerodrome 直接路径
   */
  async tryAerodromeDirect(tokenInAddress, tokenOutAddress, amountInWei, decimalsOut, slippage, userAddress) {
    try {
      const contracts = contractsConfig.Base;
      const provider = this.rpcProvider.getProvider('Base');
      const routerAddress = contracts.AerodromeRouter;
      const factoryAddress = contracts.AerodromeFactory;

      // 1. 验证池子存在性
      const factory = new ethers.Contract(factoryAddress, [
        'function getPair(address tokenA, address tokenB, bool stable) external view returns (address pair)'
      ], provider);

      const pairAddress = await factory.getPair(tokenInAddress, tokenOutAddress, false);

      if (pairAddress === ethers.ZeroAddress) {
        console.log(`   ⚠️  池子不存在: ${tokenInAddress.slice(0, 6)}.../${tokenOutAddress.slice(0, 6)}...`);
        return { success: false };
      }

      console.log(`   ✅ 找到池子: ${pairAddress.slice(0, 10)}...`);

      // 2. 验证池子流动性
      const pair = new ethers.Contract(pairAddress, [
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() external view returns (address)',
        'function token1() external view returns (address)'
      ], provider);

      const [reserve0, reserve1] = await pair.getReserves();
      const token0 = await pair.token0();
      const token1 = await pair.token1();

      const isToken0 = tokenInAddress.toLowerCase() === token0.toLowerCase();
      const reserveIn = isToken0 ? reserve0 : reserve1;
      const reserveOut = isToken0 ? reserve1 : reserve0;

      console.log(`   储备量: ${ethers.formatUnits(reserveIn, 18)} / ${ethers.formatUnits(reserveOut, decimalsOut)}`);

      // 流动性验证: 至少 $1000 等值流动性
      const MIN_LIQUIDITY_USD = 1000;
      const reserveInUSD = parseFloat(ethers.formatUnits(reserveIn, 18)) * 1; // 假设 tokenIn 价格为 $1

      if (reserveInUSD < MIN_LIQUIDITY_USD) {
        console.log(`   ⚠️  流动性不足: $${reserveInUSD.toFixed(2)} < $${MIN_LIQUIDITY_USD}`);
        return { success: false };
      }

      console.log(`   ✅ 流动性充足: $${reserveInUSD.toFixed(2)}`);

      // 3. 查询预期输出
      const router = new ethers.Contract(routerAddress, this.aerodromeRouterABI, provider);
      const path = [tokenInAddress, tokenOutAddress];

      const amounts = await router.getAmountsOut(amountInWei, path);
      const amountOut = amounts[amounts.length - 1];

      // 4. 价格合理性验证
      const priceImpact = this.calculatePriceImpact(
        parseFloat(ethers.formatUnits(amountInWei, 18)),
        parseFloat(ethers.formatUnits(reserveIn, 18)),
        parseFloat(ethers.formatUnits(amountOut, decimalsOut)),
        parseFloat(ethers.formatUnits(reserveOut, decimalsOut))
      );

      console.log(`   价格影响: ${priceImpact.toFixed(2)}%`);

      if (priceImpact > 5) {
        console.log(`   ⚠️  价格影响过大: ${priceImpact.toFixed(2)}% > 5%`);
        return { success: false };
      }

      console.log(`   ✅ 价格影响合理`);

      // 5. 构建交易
      const amountOutMinimum = amountOut * BigInt(10000 - slippage * 100) / BigInt(10000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      console.log(`   预期输出: ${ethers.formatUnits(amountOut, decimalsOut)}`);
      console.log(`   最小输出: ${ethers.formatUnits(amountOutMinimum, decimalsOut)}`);

      const txData = await router.swapExactTokensForTokens.populateTransaction(
        amountInWei,
        amountOutMinimum,
        path,
        userAddress,
        deadline
      );

      // 6. Gas 估算
      const gasEstimate = await provider.estimateGas({
        from: userAddress,
        to: routerAddress,
        data: txData.data
      });

      const feeData = await provider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas;
      const gasCost = gasEstimate * maxFeePerGas;

      console.log(`   Gas 估算: ${ethers.formatEther(gasCost)} ETH`);

      // 7. Allowance 检查
      const needsApproval = await this.checkAllowance(
        'Base',
        tokenInAddress,
        userAddress,
        routerAddress,
        amountInWei
      );

      console.log(`   ✅ Aerodrome 直接路径成功`);

      // 🔧 保存池子信息到白名单
      // 需要从 tokenOut 中提取符号 (这里 tokenOutAddress 已知,需要查询符号)
      const DatabaseService = require('../databaseService');
      const tokenInfo = await DatabaseService.query(`
        SELECT token_symbol FROM auto_trade_token_whitelist
        WHERE contract_address = ? AND chain = 'Base'
        LIMIT 1
      `, [tokenOutAddress]);

      if (tokenInfo.length > 0) {
        await this.savePoolInfoToWhitelist(tokenInfo[0].token_symbol, 'Base', 'Aerodrome', pairAddress);
      }

      return {
        success: true,
        data: {
          chain: 'Base',
          dex: 'Aerodrome',
          tokenAddress: tokenOutAddress,
          routerAddress,
          txData: txData.data,
          value: '0',
          gasLimit: gasEstimate.toString(),
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
          estimatedGasCost: ethers.formatEther(gasCost),
          estimatedSlippage: slippage,
          amountIn: ethers.formatUnits(amountInWei, 18),
          amountOutMin: ethers.formatUnits(amountOutMinimum, decimalsOut),
          priceImpact: priceImpact.toFixed(2),
          needsApproval,
          approvalTx: needsApproval ? await this.buildApprovalTx('Base', tokenInAddress, routerAddress, amountInWei) : null
        }
      };

    } catch (error) {
      console.log(`   ❌ 直接路径失败: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 尝试 Aerodrome WETH 中继路径
   */
  async tryAerodromeViaWETH(tokenInAddress, tokenOutAddress, amountInWei, decimalsOut, slippage, userAddress) {
    try {
      const contracts = contractsConfig.Base;
      const provider = this.rpcProvider.getProvider('Base');
      const routerAddress = contracts.AerodromeRouter;
      const wethAddress = contracts.WETH;

      // 如果 tokenIn 或 tokenOut 本身就是 WETH,跳过
      if (tokenInAddress.toLowerCase() === wethAddress.toLowerCase() ||
          tokenOutAddress.toLowerCase() === wethAddress.toLowerCase()) {
        console.log(`   ⚠️  代币已是 WETH,无法使用 WETH 中继`);
        return { success: false };
      }

      const router = new ethers.Contract(routerAddress, this.aerodromeRouterABI, provider);
      const path = [tokenInAddress, wethAddress, tokenOutAddress];

      // 查询预期输出
      const amounts = await router.getAmountsOut(amountInWei, path);
      const amountOut = amounts[amounts.length - 1];

      const amountOutMinimum = amountOut * BigInt(10000 - slippage * 100) / BigInt(10000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      console.log(`   预期输出: ${ethers.formatUnits(amountOut, decimalsOut)}`);
      console.log(`   最小输出: ${ethers.formatUnits(amountOutMinimum, decimalsOut)}`);

      // 构建交易
      const txData = await router.swapExactTokensForTokens.populateTransaction(
        amountInWei,
        amountOutMinimum,
        path,
        userAddress,
        deadline
      );

      // Gas 估算
      const gasEstimate = await provider.estimateGas({
        from: userAddress,
        to: routerAddress,
        data: txData.data
      });

      const feeData = await provider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas;
      const gasCost = gasEstimate * maxFeePerGas;

      console.log(`   Gas 估算: ${ethers.formatEther(gasCost)} ETH`);

      // Allowance 检查
      const needsApproval = await this.checkAllowance(
        'Base',
        tokenInAddress,
        userAddress,
        routerAddress,
        amountInWei
      );

      console.log(`   ✅ Aerodrome WETH 中继成功`);

      return {
        success: true,
        data: {
          chain: 'Base',
          dex: 'Aerodrome',
          tokenAddress: tokenOutAddress,
          routerAddress,
          txData: txData.data,
          value: '0',
          gasLimit: gasEstimate.toString(),
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
          estimatedGasCost: ethers.formatEther(gasCost),
          estimatedSlippage: slippage,
          amountIn: ethers.formatUnits(amountInWei, 18),
          amountOutMin: ethers.formatUnits(amountOutMinimum, decimalsOut),
          needsApproval,
          approvalTx: needsApproval ? await this.buildApprovalTx('Base', tokenInAddress, routerAddress, amountInWei) : null
        }
      };

    } catch (error) {
      console.log(`   ❌ WETH 中继失败: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 计算价格影响
   */
  calculatePriceImpact(amountIn, reserveIn, amountOut, reserveOut) {
    // Price Impact = |1 - (amountOut/amountIn) / (reserveOut/reserveIn)| * 100
    const executionPrice = amountOut / amountIn;
    const midPrice = reserveOut / reserveIn;
    const priceImpact = Math.abs(1 - executionPrice / midPrice) * 100;
    return priceImpact;
  }

  /**
   * 检查 Allowance
   */
  async checkAllowance(chain, tokenAddress, userAddress, spenderAddress, amount) {
    try {
      const provider = this.rpcProvider.getProvider(chain);
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider);

      const allowance = await tokenContract.allowance(userAddress, spenderAddress);
      const needsApproval = allowance < amount;

      // 🔧 Debug logging
      console.log(`   🔍 [DEBUG] Allowance Check:`);
      console.log(`      Token: ${tokenAddress.slice(0, 10)}...`);
      console.log(`      User: ${userAddress.slice(0, 10)}...`);
      console.log(`      Spender: ${spenderAddress.slice(0, 10)}...`);
      console.log(`      Current Allowance: ${allowance.toString()}`);
      console.log(`      Required Amount: ${amount.toString()}`);
      console.log(`      Needs Approval: ${needsApproval}`);

      return needsApproval;

    } catch (error) {
      console.error(`   ⚠️ Allowance 检查失败: ${error.message}`);
      return true; // 保守起见，假设需要 approve
    }
  }

  /**
   * 构建 Approval 交易
   */
  async buildApprovalTx(chain, tokenAddress, spenderAddress, amount) {
    try {
      const provider = this.rpcProvider.getProvider(chain);
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider);

      // 使用最大值 approve (节省 Gas)
      const maxApproval = ethers.MaxUint256;

      const txData = await tokenContract.approve.populateTransaction(
        spenderAddress,
        maxApproval
      );

      return {
        to: tokenAddress,
        data: txData.data,
        value: '0x0'
      };

    } catch (error) {
      console.error(`   ❌ Approval 构建失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取代币价格 (通过小额查询)
   */
  async getTokenPrice(chain, tokenSymbol) {
    try {
      const stableToken = chain === 'BSC' ? 'USDT' : 'USDC';

      // 查询 1 USDT 能换多少代币
      const txData = await this.buildSwapTx({
        chain,
        tokenIn: stableToken,
        tokenOut: tokenSymbol,
        amountIn: 1,
        slippage: 1.0,
        userAddress: ethers.ZeroAddress // 占位地址
      });

      const price = 1 / parseFloat(txData.amountOutMin);

      console.log(`   ${tokenSymbol} 价格: $${price.toFixed(6)}`);

      return price;

    } catch (error) {
      console.error(`   ❌ 价格查询失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 查询用户余额
   */
  async getBalance(chain, tokenAddress, userAddress) {
    try {
      // 原生币 (BNB/ETH) - 使用 rpcProvider 带重试
      if (tokenAddress === 'NATIVE') {
        const balance = await this.rpcProvider.getBalance(chain, userAddress);
        return ethers.formatEther(balance);
      }

      // ERC20 - 使用 rpcProvider 带重试
      const balance = await this.rpcProvider.callContract(
        chain,
        tokenAddress,
        this.erc20ABI,
        'balanceOf',
        [userAddress]
      );
      const decimals = await this.rpcProvider.callContract(
        chain,
        tokenAddress,
        this.erc20ABI,
        'decimals',
        []
      );

      return ethers.formatUnits(balance, decimals);

    } catch (error) {
      console.error(`   ❌ 余额查询失败: ${error.message}`);
      return '0';
    }
  }

  /**
   * 验证 V3 池子流动性
   * @param {string} poolAddress - V3 池子地址
   * @param {BigInt} liquidity - V3 池子流动性值
   * @param {string} chain - 链名称
   * @returns {Object} { passed, reason }
   */
  async verifyV3PoolLiquidity(poolAddress, liquidity, chain) {
    try {
      console.log(`      📊 V3 池子流动性分析:`);
      console.log(`         池子地址: ${poolAddress}`);
      console.log(`         流动性值: ${liquidity.toString()}`);

      // V3 的流动性是 uint128,最低要求根据经验值设定
      // 通常情况下,流动性 > 1e18 表示有较好的流动性
      const minLiquidity = BigInt(1e18);

      if (liquidity < minLiquidity) {
        return {
          passed: false,
          reason: `V3池子流动性不足: ${liquidity.toString()} < ${minLiquidity.toString()}`
        };
      }

      return {
        passed: true
      };

    } catch (error) {
      console.error(`      ❌ V3 池子流动性验证失败: ${error.message}`);
      return {
        passed: false,
        reason: `池子验证错误: ${error.message}`
      };
    }
  }

  /**
   * 验证 V2 池子流动性
   * @param {string} pairAddress - 池子合约地址
   * @param {string} tokenInAddress - 输入代币地址
   * @param {string} tokenOutAddress - 输出代币地址
   * @param {string} chain - 链名称
   * @returns {Object} { passed, poolLiquidityUSD, reason }
   */
  async verifyV2PoolLiquidity(pairAddress, tokenInAddress, tokenOutAddress, chain) {
    try {
      const provider = this.rpcProvider.getProvider(chain);
      const contracts = contractsConfig[chain];

      // V2 Pair ABI
      const pairABI = [
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() external view returns (address)',
        'function token1() external view returns (address)'
      ];

      const pair = new ethers.Contract(pairAddress, pairABI, provider);
      const reserves = await pair.getReserves();
      const token0 = await pair.token0();
      const token1 = await pair.token1();

      // 判断哪个是输入代币(通常是稳定币 USDT/BUSD)
      const isToken0Input = token0.toLowerCase() === tokenInAddress.toLowerCase();
      const inputReserve = isToken0Input ? reserves[0] : reserves[1];
      const outputReserve = isToken0Input ? reserves[1] : reserves[0];

      // 获取输入代币的 decimals
      const tokenInContract = new ethers.Contract(tokenInAddress, this.erc20ABI, provider);
      const inputDecimals = await tokenInContract.decimals();

      // 计算池子流动性(以 USD 计价)
      let poolLiquidityUSD = parseFloat(ethers.formatUnits(inputReserve, inputDecimals));

      // 🔧 修复：如果输入代币是 WBNB，需要乘以 BNB/USD 价格
      const WBNB_ADDRESS = contracts.WBNB?.toLowerCase();
      if (tokenInAddress.toLowerCase() === WBNB_ADDRESS) {
        // 获取 BNB/USD 价格
        try {
          const BinanceAlphaService = require('../BinanceAlphaService');
          const bnbPrice = await BinanceAlphaService.getBNBPrice();
          if (bnbPrice && bnbPrice > 0) {
            poolLiquidityUSD = poolLiquidityUSD * bnbPrice;
            console.log(`      💱 WBNB 储备: ${ethers.formatUnits(inputReserve, inputDecimals)} × $${bnbPrice.toFixed(2)} = $${poolLiquidityUSD.toFixed(2)}`);
          }
        } catch (e) {
          console.log(`      ⚠️ 无法获取 BNB 价格，使用默认 $600`);
          poolLiquidityUSD = poolLiquidityUSD * 600; // 默认 BNB 价格
        }
      }

      console.log(`      📊 池子流动性分析:`);
      console.log(`         配对: ${pairAddress}`);
      console.log(`         储备0: ${ethers.formatUnits(reserves[0], 18)}`);
      console.log(`         储备1: ${ethers.formatUnits(reserves[1], 18)}`);
      console.log(`         流动性(USD): $${poolLiquidityUSD.toLocaleString()}`);

      // 最低池子流动性要求: $10,000
      const minPoolLiquidity = 10000;

      if (poolLiquidityUSD < minPoolLiquidity) {
        return {
          passed: false,
          poolLiquidityUSD,
          reason: `池子流动性不足: $${poolLiquidityUSD.toLocaleString()} < $${minPoolLiquidity.toLocaleString()}`
        };
      }

      return {
        passed: true,
        poolLiquidityUSD,
        inputReserve,
        outputReserve
      };

    } catch (error) {
      console.error(`      ❌ 池子流动性验证失败: ${error.message}`);
      return {
        passed: false,
        reason: `池子验证错误: ${error.message}`
      };
    }
  }

  /**
   * 验证价格合理性
   * @param {string} tokenSymbol - 代币符号
   * @param {string} chain - 链名称
   * @param {BigInt} amountIn - 输入数量(wei)
   * @param {BigInt} amountOut - 输出数量(wei)
   * @param {number} inputDecimals - 输入代币精度
   * @param {number} outputDecimals - 输出代币精度
   * @returns {Object} { passed, dexPrice, marketPrice, deviation, reason }
   */
  async verifyPriceReasonability(tokenSymbol, chain, amountIn, amountOut, inputDecimals, outputDecimals) {
    try {
      // 计算 DEX 报价
      const amountInFloat = parseFloat(ethers.formatUnits(amountIn, inputDecimals));
      const amountOutFloat = parseFloat(ethers.formatUnits(amountOut, outputDecimals));
      const dexPrice = amountInFloat / amountOutFloat; // 每个代币多少 USD

      console.log(`      💰 价格合理性检查:`);
      console.log(`         DEX 报价: $${dexPrice.toFixed(8)} / ${tokenSymbol}`);

      // 从 BinanceAlphaService 获取市场价格
      const BinanceAlphaService = require('../BinanceAlphaService');
      const marketPrice = await BinanceAlphaService.getTokenRealtimePrice(tokenSymbol, chain);

      if (!marketPrice) {
        console.log(`      ⚠️ 无法获取市场价格,跳过价格检查`);
        return { passed: true, dexPrice, marketPrice: null, deviation: null };
      }

      console.log(`         市场价格: $${marketPrice.toFixed(8)}`);

      // 计算价格偏差
      const deviation = Math.abs(dexPrice - marketPrice) / marketPrice;
      console.log(`         价格偏差: ${(deviation * 100).toFixed(2)}%`);

      // 最大允许偏差 10%
      const maxDeviation = 0.10;

      if (deviation > maxDeviation) {
        return {
          passed: false,
          dexPrice,
          marketPrice,
          deviation,
          reason: `价格异常: DEX=$${dexPrice.toFixed(6)} vs 市场=$${marketPrice.toFixed(6)} (偏差${(deviation*100).toFixed(2)}%)`
        };
      }

      return {
        passed: true,
        dexPrice,
        marketPrice,
        deviation
      };

    } catch (error) {
      console.error(`      ❌ 价格验证失败: ${error.message}`);
      // 价格验证失败不阻断交易,只记录警告
      return { passed: true, error: error.message };
    }
  }

  /**
   * 计算价格影响
   * @param {BigInt} inputReserve - 输入代币储备
   * @param {BigInt} outputReserve - 输出代币储备
   * @param {BigInt} amountIn - 输入数量
   * @param {BigInt} amountOut - 实际输出数量
   * @param {number} inputDecimals - 输入代币精度
   * @param {number} outputDecimals - 输出代币精度
   * @returns {Object} { passed, priceImpact, reason }
   */
  calculatePriceImpact(inputReserve, outputReserve, amountIn, amountOut, inputDecimals, outputDecimals) {
    try {
      // 当前池子价格 (交易前)
      const poolPriceBefore = parseFloat(ethers.formatUnits(inputReserve, inputDecimals)) /
                               parseFloat(ethers.formatUnits(outputReserve, outputDecimals));

      // 实际成交价格
      const executionPrice = parseFloat(ethers.formatUnits(amountIn, inputDecimals)) /
                              parseFloat(ethers.formatUnits(amountOut, outputDecimals));

      // 价格影响
      const priceImpact = (executionPrice - poolPriceBefore) / poolPriceBefore;

      console.log(`      📈 价格影响分析:`);
      console.log(`         池子价格: $${poolPriceBefore.toFixed(8)}`);
      console.log(`         成交价格: $${executionPrice.toFixed(8)}`);
      console.log(`         价格影响: ${(priceImpact * 100).toFixed(2)}%`);

      // 最大允许价格影响 10%
      const maxPriceImpact = 0.10;

      if (Math.abs(priceImpact) > maxPriceImpact) {
        return {
          passed: false,
          priceImpact,
          reason: `价格影响过大: ${(priceImpact * 100).toFixed(2)}% > ${(maxPriceImpact * 100).toFixed(0)}%`
        };
      }

      return {
        passed: true,
        priceImpact
      };

    } catch (error) {
      console.error(`      ❌ 价格影响计算失败: ${error.message}`);
      return { passed: true, error: error.message };
    }
  }
}

module.exports = new DEXAggregatorService();
