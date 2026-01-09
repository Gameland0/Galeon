/**
 * Privy Server SDK 服务
 * 功能:
 * 1. 验证用户身份
 * 2. 获取用户嵌入式钱包地址
 * 3. 代替用户签名交易(自动交易核心)
 */

const { PrivyClient } = require('@privy-io/server-auth');

class PrivyService {
  constructor() {
    // 从环境变量读取授权密钥
    // 授权密钥用于 Session Signer API 调用时生成 privy-authorization-signature 头
    const authKey = process.env.PRIVY_AUTHORIZATION_KEY;

    console.log('🔐 [PrivyService] 初始化配置:', {
      hasAppId: !!process.env.PRIVY_APP_ID,
      hasAppSecret: !!process.env.PRIVY_APP_SECRET,
      hasAuthKey: !!authKey,
      authKeyPreview: authKey ? authKey.substring(0, 30) + '...' : 'none'
    });

    // SDK 会自动使用授权密钥生成 privy-authorization-signature 头
    this.client = new PrivyClient(
      process.env.PRIVY_APP_ID,
      process.env.PRIVY_APP_SECRET,
      {
        // 增加 API 超时时间到 30 秒
        timeout: 30000,
        // 传入授权密钥，SDK 会自动处理签名
        // 注意: authorizationPrivateKey 必须在 walletApi 对象中
        walletApi: {
          authorizationPrivateKey: authKey
        }
      }
    );
  }

  /**
   * 验证用户的 Privy Access Token
   * @param {string} accessToken - 前端传来的 token
   * @returns {Promise<{userId: string, walletAddress: string}>}
   */
  async verifyUser(accessToken) {
    try {
      console.log('🔍 [PrivyService] 开始验证 token...');
      const verifiedClaims = await this.client.verifyAuthToken(accessToken);
      console.log('✅ [PrivyService] Token 验证成功, userId:', verifiedClaims.userId);

      const userId = verifiedClaims.userId;

      // 获取用户信息
      const user = await this.client.getUser(userId);

      // 打印所有钱包信息用于调试
      console.log('🔍 [Privy] 用户所有钱包:', {
        userId: user.id,
        linkedAccounts: user.linkedAccounts
          .filter(acc => acc.type === 'wallet')
          .map(acc => ({
            type: acc.type,
            walletClient: acc.walletClient,
            walletClientType: acc.walletClientType,
            address: acc.address ? acc.address.substring(0, 10) + '...' : 'none'
          }))
      });

      // 查找钱包地址（优先嵌入式钱包，否则使用任何钱包）
      // 注意: walletClient 可能是 undefined, 所以同时检查 walletClientType
      const embeddedWallet = user.linkedAccounts.find(
        (account) => account.type === 'wallet' &&
        (account.walletClient === 'privy' || account.walletClientType === 'privy')
      );

      const anyWallet = user.linkedAccounts.find(
        (account) => account.type === 'wallet' && account.address
      );

      const wallet = embeddedWallet || anyWallet;

      if (!wallet) {
        console.error('❌ 用户没有任何钱包:', {
          userId: user.id,
          linkedAccounts: user.linkedAccounts.map(acc => ({ type: acc.type, walletClient: acc.walletClient }))
        });
        throw new Error('用户未关联钱包地址');
      }

      console.log('✅ Privy 验证成功:', {
        userId: user.id,
        selectedWalletType: wallet.walletClient || wallet.walletClientType,
        walletAddress: wallet.address.substring(0, 10) + '...',
        fullAddress: wallet.address,
        isEmbedded: !!embeddedWallet
      });

      return {
        userId: user.id,
        walletAddress: wallet.address,
        email: user.email?.address || null,
      };
    } catch (error) {
      console.error('❌ Privy 验证失败:', {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack
      });

      // 如果是超时错误,提供更明确的错误信息
      if (error.message && error.message.includes('timeout')) {
        throw new Error('Privy API 超时,请稍后重试');
      }

      throw new Error(`身份验证失败: ${error.message}`);
    }
  }

  /**
   * 获取用户的嵌入式钱包地址
   * @param {string} userId - Privy user ID
   * @returns {Promise<string>}
   */
  async getUserWalletAddress(userId) {
    try {
      const user = await this.client.getUser(userId);

      const embeddedWallet = user.linkedAccounts.find(
        (account) => account.type === 'wallet' && account.walletClient === 'privy'
      );

      if (!embeddedWallet) {
        throw new Error('用户未创建嵌入式钱包');
      }

      return embeddedWallet.address;
    } catch (error) {
      console.error('❌ 获取钱包地址失败:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 获取用户的 wallet ID (用于 Session Signer API)
   * @param {string} userId - Privy user ID
   * @returns {Promise<{walletId: string, address: string}>}
   */
  async getUserWalletInfo(userId) {
    try {
      console.log(`🔍 [getUserWalletInfo] 开始查询用户钱包:`, { userId: userId.slice(0, 20) + '...' });

      const user = await this.client.getUser(userId);

      console.log(`🔍 [getUserWalletInfo] 用户信息:`, {
        userId: user.id.slice(0, 20) + '...',
        linkedAccountsCount: user.linkedAccounts?.length || 0,
        accountTypes: user.linkedAccounts?.map(a => ({ type: a.type, walletClient: a.walletClient || a.walletClientType })) || []
      });

      // 查找 Privy 嵌入式钱包
      // 必须检查 delegated 标志，确保用户已授权后端签名
      const embeddedWallet = user.linkedAccounts.find(
        (account) => account.type === 'wallet' &&
        (account.walletClient === 'privy' || account.walletClientType === 'privy')
      );

      if (!embeddedWallet) {
        console.error(`❌ [getUserWalletInfo] 未找到 Privy 嵌入式钱包`);
        console.error(`   所有账户:`, user.linkedAccounts?.map(a => ({
          type: a.type,
          walletClient: a.walletClient,
          walletClientType: a.walletClientType,
          address: a.address
        })));
        throw new Error('用户没有 Privy 嵌入式钱包');
      }

      if (!embeddedWallet.id) {
        console.error(`❌ [getUserWalletInfo] 钱包 ID 不存在`);
        throw new Error('钱包 ID 不存在');
      }

      // 检查是否已授权 (delegated === true)
      const isDelegated = embeddedWallet.delegated === true;

      console.log(`✅ 找到 Privy 嵌入式钱包:`, {
        walletId: embeddedWallet.id,
        address: embeddedWallet.address,
        walletClientType: embeddedWallet.walletClientType || embeddedWallet.walletClient,
        delegated: isDelegated
      });

      if (!isDelegated) {
        console.error(`❌ [getUserWalletInfo] 钱包未授权给后端 (delegated = false)`);
        throw new Error('钱包未授权。请在前端点击"启用自动交易"并完成授权。');
      }

      return {
        walletId: embeddedWallet.id,
        address: embeddedWallet.address
      };
    } catch (error) {
      console.error('❌ 获取钱包信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 使用 Privy Session Signer 代签并发送交易
   * 这是实现自动交易的核心功能
   *
   * @param {string} userId - Privy user ID
   * @param {object} txData - 交易数据
   * @param {string} txData.to - 目标地址
   * @param {string} txData.data - 交易 data
   * @param {string} txData.value - 交易金额 (wei, hex string)
   * @param {number} txData.chainId - 链 ID (56=BSC, 8453=Base)
   * @param {string} [txData.gas] - Gas limit (可选, hex string)
   * @param {string} [txData.gasPrice] - Gas price (可选, hex string)
   * @returns {Promise<{hash: string}>}
   */
  async signTransaction(userId, txData) {
    try {
      console.log(`🔐 正在为用户 ${userId} 使用 Session Signer 签名交易...`);

      // 1. 获取钱包信息
      const { walletId, address } = await this.getUserWalletInfo(userId);

      console.log(`   Wallet ID: ${walletId}`);
      console.log(`   🔧 [DEBUG] 实际发送交易的钱包地址 (from): ${address}`);
      console.log(`   目标地址 (to): ${txData.to}`);
      console.log(`   链 ID: ${txData.chainId}`);

      // 构建交易对象 (server-side API 使用 transaction 字段)
      const transaction = {
        to: txData.to,
        data: txData.data || '0x',
        value: txData.value || '0x0',
        chainId: txData.chainId,
        gas: txData.gas,
        gasPrice: txData.gasPrice
      };

      console.log(`   交易参数:`, JSON.stringify(transaction, null, 2));

      // 2. 使用 Privy walletApi 发送交易
      // 根据 Privy 官方文档, server-side 使用 transaction 字段，不是 params
      const result = await this.client.walletApi.ethereum.sendTransaction({
        walletId: walletId,
        caip2: txData.chainId === 56 ? 'eip155:56' : 'eip155:8453', // BSC or Base
        transaction: transaction
      });

      console.log(`✅ 交易已发送: ${result.hash}`);

      return {
        hash: result.hash
      };

    } catch (error) {
      console.error('❌ 交易签名失败:', error.message);
      console.error('   详细错误:', error);
      throw error;
    }
  }

  /**
   * 🆕 使用 Privy Session Signer 签名消息 (用于授权等场景)
   * @param {string} userId - Privy user ID
   * @param {string} message - 要签名的消息
   * @returns {Promise<{signature: string, encoding: string}>}
   */
  async signMessage(userId, message) {
    try {
      console.log(`🔐 正在为用户 ${userId} 签名消息...`);

      // 1. 获取钱包信息
      const { walletId } = await this.getUserWalletInfo(userId);

      // 2. 使用 Privy walletApi 签名消息
      const result = await this.client.walletApi.ethereum.signMessage({
        walletId: walletId,
        message: message
      });

      console.log(`✅ 消息已签名`);

      return {
        signature: result.signature,
        encoding: result.encoding
      };

    } catch (error) {
      console.error('❌ 消息签名失败:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 等待交易确认
   * @param {string} txHash - 交易哈希
   * @param {number} chainId - 链 ID (56=BSC, 8453=Base)
   * @param {number} confirmations - 需要的确认数 (默认 1)
   * @returns {Promise<object>} 交易回执
   */
  async waitForTransaction(txHash, chainId, confirmations = 1) {
    const rpcProvider = require('../utils/rpcProvider');

    // 根据链 ID 选择链名称
    const chain = chainId === 56 ? 'BSC' : 'Base';

    try {
      console.log(`⏳ 等待交易确认: ${txHash}...`);

      // 使用 rpcProvider 带重试的等待交易
      const receipt = await rpcProvider.waitForTransaction(chain, txHash, confirmations);

      if (receipt.status === 1) {
        console.log(`✅ 交易已确认: ${txHash} (${confirmations} 个区块)`);
      } else {
        console.log(`❌ 交易执行失败: ${txHash}`);
      }

      return receipt;

    } catch (error) {
      console.error('❌ 等待交易失败:', error.message);
      throw error;
    }
  }
}

module.exports = new PrivyService();
