import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { 
  Program, 
  AnchorProvider, 
  web3, 
  BN,
  utils 
} from '@project-serum/anchor';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import IDL from '../idl/solana_team_slot_purchase.json';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Solana团队槽位购买系统的TypeScript客户端
// 合约地址: H7HaNptFbTxm4E2s7vdpaPFQFwdLT49YK7Z6BffxiuWm

export interface UserLimitInfo {
  user: PublicKey;
  teamLimit: number;
  teamsCreated: number;
  slotsPurchased: number;
  totalSpentUsdc: number;
  availableSlots: number;
}

export interface SlotConfig {
  authority: PublicKey;
  treasuryUsdc: PublicKey;
  usdcMint: PublicKey;
  slotPriceUsdc: number;
  defaultTeamLimit: number;
  totalSlotsSold: number;
  isActive: boolean;
}

export class SolanaTeamSlotPurchaseClient {
  private connection: Connection;
  private program: Program | null = null;
  private provider: AnchorProvider | null = null;
  private programId: PublicKey;
  
  // 合约配置常量 - 重新部署到Devnet
  public static readonly PROGRAM_ID = "3NGwXTcUZ2sECBiKZy9AphP9bALA9i37twVpkcMMZtPi";
  public static readonly USDC_MINT_DEVNET = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
  public static readonly TREASURY_WALLET = "8TcQfQY12sMweH9EkvrrXbcgSeB5KGLTUPA4Jmixpm74";

  constructor(
    connection: Connection, 
    wallet: WalletContextState
  ) {
    this.connection = connection;
    this.programId = new PublicKey(SolanaTeamSlotPurchaseClient.PROGRAM_ID);
    
    if (wallet.publicKey && wallet.connected) {
      // 使用优化的provider配置
      const providerOptions = {
        commitment: 'confirmed' as any,
        preflightCommitment: 'processed' as any,
        skipPreflight: false,
        maxRetries: 2,
      };
      this.provider = new AnchorProvider(connection, wallet as any, providerOptions);
      
      try {
        // 创建一个修改过的IDL，移除address字段让Anchor使用传入的programId
        const modifiedIDL = { ...IDL };
        delete (modifiedIDL as any).address;
        this.program = new Program(modifiedIDL as any, this.programId, this.provider);
        console.log('✅ SolanaTeamSlotPurchaseClient initialized successfully');
      } catch (error) {
        console.error('Failed to create SolanaTeamSlotPurchaseClient program:', error);
        try {
          // 降级尝试使用原始IDL
          this.program = new Program(IDL as any, this.programId, this.provider);
          console.log('✅ SolanaTeamSlotPurchaseClient initialized with original IDL');
        } catch (fallbackError) {
          console.error('Failed to create program with original IDL:', fallbackError);
          this.program = null;
        }
      }
    }
  }

  // ===== PDA 计算方法 =====

  async getSlotConfigPDA(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from("slot_config")],
      this.programId
    );
  }

  async getUserTeamLimitPDA(user: PublicKey): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from("user_team_limit"), user.toBuffer()],
      this.programId
    );
  }

  // ===== 核心购买方法 =====

  async buyTeamSlotUsdc(onConfirm?: (success: boolean, error?: any) => void): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    console.log('🛒 Starting USDC team slot purchase...');

    const [slotConfigPDA] = await this.getSlotConfigPDA();
    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);
    
    try {
      // 获取slot配置
      const slotConfigAccount = await this.program.account.slotConfig.fetch(slotConfigPDA);
      console.log('📄 Slot config loaded:', {
        usdcPrice: slotConfigAccount.slotPriceUsdc.toString(),
        isActive: slotConfigAccount.isActive
      });

      if (!slotConfigAccount.isActive) {
        throw new Error('Team slot purchase system is not active');
      }

      // 获取用户的USDC token账户
      const usdcMint = new PublicKey(SolanaTeamSlotPurchaseClient.USDC_MINT_DEVNET);
      const userUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        this.provider.wallet.publicKey
      );

      // 获取收款方的USDC token账户
      const treasuryWallet = new PublicKey(SolanaTeamSlotPurchaseClient.TREASURY_WALLET);
      const treasuryUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        treasuryWallet
      );

      console.log('🏦 Token accounts:', {
        userUsdc: userUsdcAccount.toBase58(),
        treasuryUsdc: treasuryUsdcAccount.toBase58()
      });

      // 检查用户是否有团队限制账户，如果没有则先初始化
      try {
        await this.program.account.userTeamLimit.fetch(userLimitPDA);
        console.log('✅ User team limit account exists');
      } catch (error) {
        console.log('🔧 Initializing user team limit account...');
        const initTx = await this.initializeUserLimitFast();
        console.log('✅ User limit initialized:', initTx);
      }

      // 创建购买交易
      const transaction = await this.program.methods
        .buyTeamSlotUsdc()
        .accounts({
          user: this.provider.wallet.publicKey,
          slotConfig: slotConfigPDA,
          userLimit: userLimitPDA,
          userUsdcAccount: userUsdcAccount,
          treasuryUsdcAccount: treasuryUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();

      // 设置最新的blockhash
      const latestBlockhash = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = this.provider.wallet.publicKey;

      console.log('📝 Transaction created, requesting signature...');

      // 签名交易
      const signedTransaction = await this.provider.wallet.signTransaction(transaction);
      
      // 发送已签名的交易，使用更快的设置
      const tx = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: true,  // 跳过preflight加快速度
        preflightCommitment: 'processed',
        maxRetries: 3
      });

      console.log('🚀 USDC team slot purchase transaction sent:', tx);
      console.log('🔗 View on explorer: https://explorer.solana.com/tx/' + tx + '?cluster=devnet');
      
      // 异步确认交易，不阻塞返回
      if (onConfirm) {
        console.log('✓ onConfirm callback provided, will notify UI');
        this.confirmTransactionInBackground(tx, onConfirm);
      } else {
        console.log('⚠️ No onConfirm callback provided');
        this.confirmTransactionInBackground(tx);
      }

      return tx;
    } catch (error) {
      console.error('❌ USDC team slot purchase failed:', error);
      throw error;
    }
  }


  // ===== 辅助方法 =====

  // 原有的初始化方法，保留用于单独调用
  async initializeUserLimit(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [slotConfigPDA] = await this.getSlotConfigPDA();
    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);

    const transaction = await this.program.methods
      .initializeUserLimit()
      .accounts({
        user: this.provider.wallet.publicKey,
        slotConfig: slotConfigPDA,
        userLimit: userLimitPDA,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // 设置最新的blockhash
    const latestBlockhash = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = this.provider.wallet.publicKey;

    // 签名交易
    const signedTransaction = await this.provider.wallet.signTransaction(transaction);
    
    // 发送已签名的交易
    const tx = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    console.log('🔧 User limit initialization transaction sent:', tx);
    
    // 等待确认
    await this.connection.confirmTransaction(tx, 'confirmed');
    console.log('✅ User limit initialization confirmed');

    return tx;
  }

  // 快速初始化方法，不等待确认
  private async initializeUserLimitFast(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [slotConfigPDA] = await this.getSlotConfigPDA();
    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);

    const transaction = await this.program.methods
      .initializeUserLimit()
      .accounts({
        user: this.provider.wallet.publicKey,
        slotConfig: slotConfigPDA,
        userLimit: userLimitPDA,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // 设置最新的blockhash
    const latestBlockhash = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = this.provider.wallet.publicKey;

    // 签名交易
    const signedTransaction = await this.provider.wallet.signTransaction(transaction);
    
    // 发送已签名的交易，但不等待确认
    const tx = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    console.log('🔧 User limit initialization transaction sent (fast):', tx);
    
    // 在后台确认但不阻塞
    this.confirmTransactionInBackground(tx);
    
    // 等待短暂时间让交易传播
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return tx;
  }

  // ===== 查询方法 =====

  async getUserLimit(userPubkey?: PublicKey): Promise<UserLimitInfo | null> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const user = userPubkey || this.provider?.wallet.publicKey;
    if (!user) {
      throw new Error('No user public key provided');
    }

    try {
      const [userLimitPDA] = await this.getUserTeamLimitPDA(user);
      const userLimitAccount = await this.program.account.userTeamLimit.fetch(userLimitPDA);
      
      return {
        user: userLimitAccount.user,
        teamLimit: userLimitAccount.teamLimit,
        teamsCreated: userLimitAccount.teamsCreated,
        slotsPurchased: userLimitAccount.slotsPurchased.toNumber(),
        totalSpentUsdc: userLimitAccount.totalSpentUsdc.toNumber(),
        availableSlots: userLimitAccount.teamLimit - userLimitAccount.teamsCreated,
      };
    } catch (error) {
      console.log('User limit account not found or not initialized');
      return null;
    }
  }

  async getSlotConfig(): Promise<SlotConfig | null> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    try {
      const [slotConfigPDA] = await this.getSlotConfigPDA();
      const slotConfigAccount = await this.program.account.slotConfig.fetch(slotConfigPDA);
      
      return {
        authority: slotConfigAccount.authority,
        treasuryUsdc: slotConfigAccount.treasuryUsdc,
        usdcMint: slotConfigAccount.usdcMint,
        slotPriceUsdc: slotConfigAccount.slotPriceUsdc.toNumber(),
        defaultTeamLimit: slotConfigAccount.defaultTeamLimit,
        totalSlotsSold: slotConfigAccount.totalSlotsSold.toNumber(),
        isActive: slotConfigAccount.isActive,
      };
    } catch (error) {
      console.error('Failed to fetch slot config:', error);
      return null;
    }
  }

  // ===== 团队计数管理方法 =====

  async incrementTeamCount(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);

    const transaction = await this.program.methods
      .incrementTeamCount()
      .accounts({
        user: this.provider.wallet.publicKey,
        userLimit: userLimitPDA,
      })
      .transaction();

    // 设置最新的blockhash
    const latestBlockhash = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = this.provider.wallet.publicKey;

    // 签名交易
    const signedTransaction = await this.provider.wallet.signTransaction(transaction);
    
    // 发送已签名的交易
    const tx = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async decrementTeamCount(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);

    const transaction = await this.program.methods
      .decrementTeamCount()
      .accounts({
        user: this.provider.wallet.publicKey,
        userLimit: userLimitPDA,
      })
      .transaction();

    // 设置最新的blockhash
    const latestBlockhash = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = this.provider.wallet.publicKey;

    // 签名交易
    const signedTransaction = await this.provider.wallet.signTransaction(transaction);
    
    // 发送已签名的交易
    const tx = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  // ===== 后台确认方法 =====

  private async confirmTransactionInBackground(signature: string, onConfirm?: (success: boolean, error?: any) => void) {
    console.log('🔍 confirmTransactionInBackground started for:', signature);
    
    const maxRetries = 10;
    const retryDelay = 30000; // 30秒间隔
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`🔍 Checking transaction status (attempt ${i + 1}/${maxRetries}):`, signature);
        
        // 使用简单的状态查询，避免blockhash问题
        const txStatus = await this.connection.getSignatureStatus(signature);
        
        if (txStatus.value) {
          if (txStatus.value.err) {
            console.error('❌ Transaction failed:', signature, txStatus.value.err);
            console.log('📞 Calling onConfirm with failure...');
            if (onConfirm) {
              onConfirm(false, txStatus.value.err);
            }
            return;
          } else {
            console.log('✅ Transaction confirmed successfully:', signature);
            console.log('📞 Calling onConfirm with success...');
            if (onConfirm) {
              onConfirm(true);
            }
            return;
          }
        }
        
        // 如果状态为null，交易可能还在处理中
        console.log('⏳ Transaction still processing, waiting...');
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
      } catch (error) {
        console.error(`❌ Error checking transaction status (attempt ${i + 1}):`, error);
        
        // 如果是最后一次尝试，调用onConfirm
        if (i === maxRetries - 1) {
          console.log('📞 Final attempt failed, calling onConfirm with error...');
          if (onConfirm) {
            onConfirm(false, error);
          }
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    // 如果所有重试都失败，调用onConfirm
    console.log('⏰ All retries exhausted for transaction:', signature);
    if (onConfirm) {
      onConfirm(false, new Error('Transaction confirmation timeout'));
    }
  }
}