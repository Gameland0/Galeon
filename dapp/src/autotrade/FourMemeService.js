/**
 * Four.meme 服务
 * 用于 BSC meme 代币的查询和交易
 *
 * Four.meme 是 BSC 上类似 pump.fun 的 meme 平台
 * 代币在 bonding curve 阶段通过 TokenManager 合约交易
 * 当流动性满足条件后会自动添加到 PancakeSwap
 *
 * 合约地址:
 * - TokenManager V1: 0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC (2024年9月5日前)
 * - TokenManager V2: 0x5c952063c7fc8610FFDB798152D69F0B9550762b (2024年9月5日后)
 * - TokenManagerHelper V3: 0xF251F83e40a78868FcfA3FA4599Dad6494E46034
 */

const { ethers } = require('ethers');
const rpcProvider = require('../../utils/rpcProvider');
const contractsConfig = require('../../config/contracts');

class FourMemeService {
  constructor() {
    // Four.meme 合约地址
    this.contracts = {
      TokenManagerV1: '0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC',
      TokenManagerV2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
      TokenManagerHelper: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034'
    };

    // TokenManagerHelper ABI (V3)
    this.helperABI = [
      // 获取代币信息
      'function getTokenInfo(address token) external view returns (uint8 version, address tokenManager, address quote, uint256 lastPrice, bool liquidityAdded)',
      // 预计算购买数量
      'function tryBuy(address token, uint256 amount, uint256 funds) external view returns (uint256 newAmount, uint256 newFunds, uint256 fee)',
      // 预计算卖出收益
      'function trySell(address token, uint256 amount) external view returns (uint256 newAmount, uint256 funds, uint256 fee)'
    ];

    // TokenManager V2 ABI
    this.tokenManagerV2ABI = [
      // 使用 BNB 购买代币 (尽可能多买)
      'function buyTokenAMAP(address token, uint256 minAmount) external payable',
      // 使用 BNB 购买指定数量代币
      'function buyToken(address token, uint256 amount) external payable',
      // 卖出代币
      'function sellToken(address token, uint256 amount) external'
    ];

    // TokenManager V1 ABI (略有不同)
    this.tokenManagerV1ABI = [
      'function buyTokenAMAP(address token, uint256 minAmount) external payable',
      'function buyToken(address token, uint256 amount) external payable',
      'function sellToken(address token, uint256 amount) external'
    ];

    // ERC20 ABI
    this.erc20ABI = [
      'function name() external view returns (string)',
      'function symbol() external view returns (string)',
      'function decimals() external view returns (uint8)',
      'function totalSupply() external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)'
    ];

    // 缓存
    this.tokenInfoCache = new Map();
    this.cacheTTL = 60000; // 1分钟缓存

    console.log('✅ FourMemeService initialized');
  }

  /**
   * 获取代币信息
   * 判断代币是否来自 four.meme 平台
   * @param {string} tokenAddress - 代币合约地址
   * @returns {Object|null} { isFourMeme, version, tokenManager, quote, lastPrice, liquidityAdded, symbol, decimals }
   */
  async getTokenInfo(tokenAddress) {
    try {
      // 检查缓存
      const cached = this.tokenInfoCache.get(tokenAddress.toLowerCase());
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }

      const provider = rpcProvider.getProvider('BSC');
      const helper = new ethers.Contract(
        this.contracts.TokenManagerHelper,
        this.helperABI,
        provider
      );

      console.log(`   🔍 [FourMeme] 查询代币信息: ${tokenAddress}`);

      // 调用 getTokenInfo
      const [version, tokenManager, quote, lastPrice, liquidityAdded] = await helper.getTokenInfo(tokenAddress);

      // 如果 version 为 0，说明不是 four.meme 代币
      if (version === 0 || version === 0n) {
        console.log(`   ❌ [FourMeme] 非 four.meme 代币 (version=0)`);

        const result = { isFourMeme: false };
        this.tokenInfoCache.set(tokenAddress.toLowerCase(), {
          data: result,
          timestamp: Date.now()
        });
        return result;
      }

      // 获取代币符号和精度
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider);
      const [symbol, decimals, name] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name()
      ]);

      // 获取 BNB 价格
      const bnbPrice = await this.getBNBPrice();

      // 🔧 价格获取逻辑：
      // - liquidityAdded = false: 使用 four.meme 的 lastPrice (bonding curve 阶段)
      // - liquidityAdded = true: 从 PancakeSwap 获取实时价格
      let priceInBNB, priceInUSD;

      if (liquidityAdded) {
        // 代币已上 PancakeSwap，获取 DEX 实时价格
        const dexPrice = await this.getPancakeSwapPrice(tokenAddress, Number(decimals));
        if (dexPrice && dexPrice.priceInBNB > 0) {
          priceInBNB = dexPrice.priceInBNB;
          priceInUSD = dexPrice.priceInUSD;
          console.log(`   📈 [FourMeme] 使用 PancakeSwap 实时价格`);
        } else {
          // DEX 价格获取失败，降级使用 lastPrice
          priceInBNB = parseFloat(ethers.formatEther(lastPrice));
          priceInUSD = priceInBNB * bnbPrice;
          console.log(`   ⚠️ [FourMeme] DEX 价格获取失败，使用 lastPrice`);
        }
      } else {
        // bonding curve 阶段，使用 four.meme 的 lastPrice
        priceInBNB = parseFloat(ethers.formatEther(lastPrice));
        priceInUSD = priceInBNB * bnbPrice;
      }

      const result = {
        isFourMeme: true,
        version: Number(version),
        tokenManager: tokenManager,
        quote: quote, // 报价代币 (通常是 WBNB)
        lastPrice: lastPrice.toString(),
        lastPriceBNB: priceInBNB,
        lastPriceUSD: priceInUSD,
        liquidityAdded: liquidityAdded, // 是否已添加流动性到 PancakeSwap
        symbol: symbol,
        decimals: Number(decimals),
        name: name,
        tokenAddress: tokenAddress
      };

      console.log(`   ✅ [FourMeme] 代币信息:`);
      console.log(`      名称: ${name} (${symbol})`);
      console.log(`      版本: V${result.version}`);
      console.log(`      TokenManager: ${tokenManager}`);
      console.log(`      价格: ${priceInBNB.toFixed(10)} BNB (~$${priceInUSD.toFixed(6)})`);
      console.log(`      流动性已添加: ${liquidityAdded ? '是 (已上 PancakeSwap)' : '否 (bonding curve)'}`);

      // 缓存
      this.tokenInfoCache.set(tokenAddress.toLowerCase(), {
        data: result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error(`   ❌ [FourMeme] 查询失败: ${error.message}`);

      // 如果调用失败，可能不是 four.meme 代币
      return { isFourMeme: false, error: error.message };
    }
  }

  /**
   * 预计算购买数量
   * @param {string} tokenAddress - 代币地址
   * @param {number} bnbAmount - BNB 数量
   * @returns {Object} { estimatedTokens, fee, priceImpact }
   */
  async tryBuy(tokenAddress, bnbAmount) {
    try {
      const provider = rpcProvider.getProvider('BSC');
      const helper = new ethers.Contract(
        this.contracts.TokenManagerHelper,
        this.helperABI,
        provider
      );

      const fundsWei = ethers.parseEther(bnbAmount.toString());

      // tryBuy(token, amount=0, funds) - amount=0 表示计算最大可买数量
      const [newAmount, newFunds, fee] = await helper.tryBuy(tokenAddress, 0, fundsWei);

      // 获取代币精度
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider);
      const decimals = await tokenContract.decimals();

      const estimatedTokens = parseFloat(ethers.formatUnits(newAmount, decimals));
      const feeInBNB = parseFloat(ethers.formatEther(fee));

      console.log(`   📊 [FourMeme] 购买预估:`);
      console.log(`      投入: ${bnbAmount} BNB`);
      console.log(`      预期获得: ${estimatedTokens.toLocaleString()} 代币`);
      console.log(`      手续费: ${feeInBNB.toFixed(6)} BNB`);

      return {
        estimatedTokens,
        estimatedTokensWei: newAmount.toString(),
        fee: feeInBNB,
        feeWei: fee.toString(),
        fundsUsed: parseFloat(ethers.formatEther(newFunds))
      };

    } catch (error) {
      console.error(`   ❌ [FourMeme] 预估购买失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 预计算卖出收益
   * @param {string} tokenAddress - 代币地址
   * @param {string|number} tokenAmount - 代币数量
   * @returns {Object} { estimatedBNB, fee }
   */
  async trySell(tokenAddress, tokenAmount) {
    try {
      const provider = rpcProvider.getProvider('BSC');
      const helper = new ethers.Contract(
        this.contracts.TokenManagerHelper,
        this.helperABI,
        provider
      );

      // 获取代币精度
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider);
      const decimals = await tokenContract.decimals();

      const amountWei = ethers.parseUnits(tokenAmount.toString(), decimals);

      const [newAmount, funds, fee] = await helper.trySell(tokenAddress, amountWei);

      const estimatedBNB = parseFloat(ethers.formatEther(funds));
      const feeInBNB = parseFloat(ethers.formatEther(fee));

      console.log(`   📊 [FourMeme] 卖出预估:`);
      console.log(`      卖出: ${tokenAmount} 代币`);
      console.log(`      预期获得: ${estimatedBNB.toFixed(6)} BNB`);
      console.log(`      手续费: ${feeInBNB.toFixed(6)} BNB`);

      return {
        estimatedBNB,
        estimatedBNBWei: funds.toString(),
        fee: feeInBNB,
        feeWei: fee.toString()
      };

    } catch (error) {
      console.error(`   ❌ [FourMeme] 预估卖出失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 构建购买交易数据
   * @param {Object} params - { tokenAddress, bnbAmount, slippage, userAddress }
   * @returns {Object} 交易数据
   */
  async buildBuyTx(params) {
    const { tokenAddress, bnbAmount, slippage = 10, userAddress } = params;

    try {
      console.log(`\n🔧 [FourMeme] 构建购买交易:`);
      console.log(`   代币: ${tokenAddress}`);
      console.log(`   金额: ${bnbAmount} BNB`);
      console.log(`   滑点: ${slippage}%`);

      // 1. 获取代币信息
      const tokenInfo = await this.getTokenInfo(tokenAddress);

      if (!tokenInfo.isFourMeme) {
        throw new Error('非 four.meme 代币，请使用 PancakeSwap');
      }

      if (tokenInfo.liquidityAdded) {
        throw new Error('代币已上 PancakeSwap，请使用 DEXAggregatorService');
      }

      // 2. 预估购买数量
      const estimate = await this.tryBuy(tokenAddress, bnbAmount);

      // 3. 计算最小获得数量 (考虑滑点)
      const minAmountWei = BigInt(estimate.estimatedTokensWei) * BigInt(10000 - slippage * 100) / BigInt(10000);

      // 4. 确定使用哪个 TokenManager
      const tokenManagerAddress = tokenInfo.tokenManager;
      const abi = tokenInfo.version === 1 ? this.tokenManagerV1ABI : this.tokenManagerV2ABI;

      // 5. 构建交易数据
      const iface = new ethers.Interface(abi);
      const txData = iface.encodeFunctionData('buyTokenAMAP', [
        tokenAddress,
        minAmountWei
      ]);

      // 6. 估算 Gas
      const provider = rpcProvider.getProvider('BSC');
      const gasPrice = (await provider.getFeeData()).gasPrice;
      const gasLimit = BigInt(300000); // four.meme 交易通常需要更多 gas

      const bnbAmountWei = ethers.parseEther(bnbAmount.toString());

      console.log(`   ✅ [FourMeme] 交易构建完成:`);
      console.log(`      TokenManager: ${tokenManagerAddress}`);
      console.log(`      预期获得: ${estimate.estimatedTokens.toLocaleString()} 代币`);
      console.log(`      最小获得: ${ethers.formatUnits(minAmountWei, tokenInfo.decimals)} 代币`);

      return {
        chain: 'BSC',
        dex: 'FourMeme',
        version: `V${tokenInfo.version}`,
        tokenAddress: tokenAddress,
        routerAddress: tokenManagerAddress,
        txData: txData,
        value: '0x' + bnbAmountWei.toString(16), // BNB 作为 value 发送
        gasLimit: '0x' + gasLimit.toString(16),
        gasPrice: '0x' + gasPrice.toString(16),
        estimatedGasCost: ethers.formatEther(gasLimit * gasPrice),
        estimatedSlippage: slippage,
        amountIn: bnbAmount.toString(),
        amountInWei: bnbAmountWei.toString(),
        amountOutMin: ethers.formatUnits(minAmountWei, tokenInfo.decimals),
        amountOutMinWei: minAmountWei.toString(),
        estimatedOut: estimate.estimatedTokens,
        tokenSymbol: tokenInfo.symbol,
        tokenDecimals: tokenInfo.decimals,
        priceUSD: tokenInfo.lastPriceUSD,
        needsApproval: false, // 购买不需要 approve
        approvalTx: null,
        isFourMeme: true
      };

    } catch (error) {
      console.error(`   ❌ [FourMeme] 构建购买交易失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 构建卖出交易数据
   * @param {Object} params - { tokenAddress, tokenAmount, slippage, userAddress }
   * @returns {Object} 交易数据
   */
  async buildSellTx(params) {
    const { tokenAddress, tokenAmount, slippage = 10, userAddress } = params;

    try {
      console.log(`\n🔧 [FourMeme] 构建卖出交易:`);
      console.log(`   代币: ${tokenAddress}`);
      console.log(`   数量: ${tokenAmount}`);
      console.log(`   滑点: ${slippage}%`);

      // 1. 获取代币信息
      const tokenInfo = await this.getTokenInfo(tokenAddress);

      if (!tokenInfo.isFourMeme) {
        throw new Error('非 four.meme 代币，请使用 PancakeSwap');
      }

      if (tokenInfo.liquidityAdded) {
        throw new Error('代币已上 PancakeSwap，请使用 DEXAggregatorService');
      }

      // 2. 预估卖出收益
      const estimate = await this.trySell(tokenAddress, tokenAmount);

      // 3. 确定使用哪个 TokenManager
      const tokenManagerAddress = tokenInfo.tokenManager;
      const abi = tokenInfo.version === 1 ? this.tokenManagerV1ABI : this.tokenManagerV2ABI;

      // 4. 构建交易数据
      const amountWei = ethers.parseUnits(tokenAmount.toString(), tokenInfo.decimals);
      const iface = new ethers.Interface(abi);
      const txData = iface.encodeFunctionData('sellToken', [
        tokenAddress,
        amountWei
      ]);

      // 5. 估算 Gas
      const provider = rpcProvider.getProvider('BSC');
      const gasPrice = (await provider.getFeeData()).gasPrice;
      const gasLimit = BigInt(300000);

      // 6. 检查 Allowance
      const needsApproval = await this.checkAllowance(
        tokenAddress,
        userAddress,
        tokenManagerAddress,
        amountWei
      );

      console.log(`   ✅ [FourMeme] 交易构建完成:`);
      console.log(`      TokenManager: ${tokenManagerAddress}`);
      console.log(`      预期获得: ${estimate.estimatedBNB.toFixed(6)} BNB`);
      console.log(`      需要授权: ${needsApproval}`);

      return {
        chain: 'BSC',
        dex: 'FourMeme',
        version: `V${tokenInfo.version}`,
        tokenAddress: tokenAddress,
        routerAddress: tokenManagerAddress,
        txData: txData,
        value: '0x0', // 卖出不需要发送 BNB
        gasLimit: '0x' + gasLimit.toString(16),
        gasPrice: '0x' + gasPrice.toString(16),
        estimatedGasCost: ethers.formatEther(gasLimit * gasPrice),
        estimatedSlippage: slippage,
        amountIn: tokenAmount.toString(),
        amountInWei: amountWei.toString(),
        estimatedOut: estimate.estimatedBNB,
        estimatedOutWei: estimate.estimatedBNBWei,
        tokenSymbol: tokenInfo.symbol,
        tokenDecimals: tokenInfo.decimals,
        needsApproval,
        approvalTx: needsApproval ? await this.buildApprovalTx(tokenAddress, tokenManagerAddress, amountWei) : null,
        isFourMeme: true
      };

    } catch (error) {
      console.error(`   ❌ [FourMeme] 构建卖出交易失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查授权额度
   */
  async checkAllowance(tokenAddress, userAddress, spenderAddress, amount) {
    try {
      const provider = rpcProvider.getProvider('BSC');
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider);

      const allowance = await tokenContract.allowance(userAddress, spenderAddress);
      return allowance < amount;

    } catch (error) {
      console.error(`   ⚠️ [FourMeme] Allowance 检查失败: ${error.message}`);
      return true;
    }
  }

  /**
   * 构建授权交易
   */
  async buildApprovalTx(tokenAddress, spenderAddress, amount) {
    const iface = new ethers.Interface(this.erc20ABI);
    const txData = iface.encodeFunctionData('approve', [
      spenderAddress,
      ethers.MaxUint256 // 授权最大值
    ]);

    return {
      to: tokenAddress,
      data: txData,
      value: '0x0'
    };
  }

  /**
   * 从 PancakeSwap 获取代币价格
   * @param {string} tokenAddress - 代币地址
   * @param {number} decimals - 代币精度
   * @returns {Object|null} { priceInBNB, priceInUSD }
   */
  async getPancakeSwapPrice(tokenAddress, decimals = 18) {
    try {
      const provider = rpcProvider.getProvider('BSC');
      const contracts = contractsConfig.BSC;

      // PancakeSwap V2 Router ABI
      const routerABI = [
        'function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)'
      ];

      const router = new ethers.Contract(contracts.PancakeRouterV2, routerABI, provider);

      // 计算 1 个代币值多少 WBNB
      const amountIn = ethers.parseUnits('1', decimals); // 1 代币
      const path = [tokenAddress, contracts.WBNB];

      const amounts = await router.getAmountsOut(amountIn, path);
      const priceInBNB = parseFloat(ethers.formatEther(amounts[1]));

      // 获取 BNB/USD 价格
      const bnbPrice = await this.getBNBPrice();
      const priceInUSD = priceInBNB * bnbPrice;

      console.log(`   💱 [FourMeme] PancakeSwap 价格: ${priceInBNB.toFixed(12)} BNB (~$${priceInUSD.toFixed(8)})`);

      return { priceInBNB, priceInUSD };

    } catch (error) {
      console.error(`   ⚠️ [FourMeme] PancakeSwap 价格获取失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取 BNB 价格 (USD)
   */
  async getBNBPrice() {
    try {
      // 从 PancakeSwap 查询 WBNB/BUSD 价格
      const provider = rpcProvider.getProvider('BSC');
      const contracts = contractsConfig.BSC;

      // 使用 PancakeSwap V2 Router 查询
      const routerABI = ['function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)'];
      const router = new ethers.Contract(contracts.PancakeRouterV2, routerABI, provider);

      const amountIn = ethers.parseEther('1'); // 1 BNB
      const path = [contracts.WBNB, contracts.BUSD];

      const amounts = await router.getAmountsOut(amountIn, path);
      const bnbPrice = parseFloat(ethers.formatUnits(amounts[1], 18));

      return bnbPrice;

    } catch (error) {
      console.error(`   ⚠️ [FourMeme] 获取 BNB 价格失败: ${error.message}`);
      return 600; // 默认价格
    }
  }

  /**
   * 将 USDT 金额转换为 BNB
   * @param {number} usdtAmount - USDT 金额
   * @returns {number} BNB 数量
   */
  async usdtToBNB(usdtAmount) {
    const bnbPrice = await this.getBNBPrice();
    return usdtAmount / bnbPrice;
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.tokenInfoCache.clear();
    console.log('   🧹 [FourMeme] 缓存已清理');
  }
}

module.exports = new FourMemeService();
