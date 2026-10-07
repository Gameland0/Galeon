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
import IDL from '../idl/solana_agent_registry.json';
import TEAM_IDL from '../contracts/SolanaTeamRegistry.json';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Solana Agent注册系统的TypeScript客户端

export interface AgentData {
  name: string;
  description: string;
  agentType: string;
  ipfsHash: string;
  imageUrl?: string;
}

export interface TeamData {
  teamUuid: string;
  name: string;
  description: string;
}

export interface SolanaAgent {
  id: number;
  owner: string;
  name: string;
  description: string;
  agentType: string;
  ipfsHash: string;
  imageUrl: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SolanaTeam {
  id: number;
  teamUuid: string;
  owner: string;
  name: string;
  description: string;
  agentCount: number;
  maxAgents: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TeamAgent {
  teamId: number;
  agentId: number;
  role: string;
  addedAt: number;
}

export class SolanaAgentClient {
  private connection: Connection;
  private program: Program | null = null;
  private provider: AnchorProvider | null = null;
  private programId: PublicKey;
  private teamProgram: Program | null = null;
  private teamProgramId: PublicKey;

  constructor(
    connection: Connection, 
    wallet: WalletContextState, 
    programId: string
  ) {
    this.connection = connection;
    this.programId = new PublicKey(programId);
    this.teamProgramId = new PublicKey("6XjuPcso5CRNbHE8rWZ8hhER9iDFfA7jXpf86EksWr5V");
    
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
      } catch (error) {
        console.error('Failed to create program with modified IDL, trying original:', error);
        // 如果修改IDL失败，使用原始方法
        this.program = new Program(IDL as any, this.programId, this.provider);
      }
      
      // 初始化团队注册program
      try {
        this.teamProgram = new Program(TEAM_IDL as any, this.teamProgramId, this.provider);
      } catch (error) {
        console.error('Failed to create team program:', error);
      }
    }
  }

  // 检查连接状态
  isConnected(): boolean {
    return this.provider !== null && this.program !== null;
  }

  // 后台异步确认交易，使用简单有效的状态查询
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
            onConfirm?.(false, txStatus.value.err);
            return;
          }
          
          // 检查确认状态
          const confirmationStatus = txStatus.value.confirmationStatus;
          console.log(`📊 Transaction status: ${confirmationStatus}, confirmations: ${txStatus.value.confirmations}`);
          
          if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
            console.log('✅ Transaction confirmed:', signature);
            console.log('📞 Calling onConfirm with success...');
            onConfirm?.(true);
            return;
          }
          
          // 如果是processed状态，继续等待更高级别的确认
          if (confirmationStatus === 'processed') {
            console.log('⏳ Transaction processed, waiting for confirmation...');
          }
        } else {
          console.log('⏳ Transaction not found yet, will retry...');
        }
        
        // 等待后重试
        if (i < maxRetries - 1) {
          console.log(`⏳ Waiting ${retryDelay}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
      } catch (error: any) {
        console.warn(`⚠️ Error checking transaction status (attempt ${i + 1}):`, error);
        
        if (i === maxRetries - 1) {
          console.error('❌ All status check attempts failed:', signature);
          onConfirm?.(false, error);
          return;
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    console.error('❌ Transaction confirmation timeout after all retries:', signature);
    onConfirm?.(false, new Error('Transaction confirmation timeout after extended retries'));
  }

  // ===== PDA地址计算辅助函数 =====

  async getRegistryPDA(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from('agent_registry')],
      this.programId
    );
  }

  async getAgentPDA(agentId: number, userPubkey?: PublicKey): Promise<[PublicKey, number]> {
    const user = userPubkey || this.provider?.wallet.publicKey;
    if (!user) {
      throw new Error('User public key required for PDA generation');
    }
    return await PublicKey.findProgramAddress(
      [Buffer.from('agent'), user.toBuffer(), new BN(agentId).toArrayLike(Buffer, 'le', 8)],
      this.programId
    );
  }

  // 新的PDA生成方法，使用用户地址和随机数
  async getUserAgentPDA(userPubkey: PublicKey, nonce: number): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [
        Buffer.from('user_agent'),
        userPubkey.toBuffer(),
        new BN(nonce).toArrayLike(Buffer, 'le', 8)
      ],
      this.programId
    );
  }

  async getTeamRegistryPDA(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from('team_registry')],
      this.programId
    );
  }

  async getTeamPDA(teamId: number): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from('team'), new BN(teamId).toArrayLike(Buffer, 'le', 8)],
      this.programId
    );
  }

  async getUserTeamLimitPDA(userPubkey: PublicKey): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from('user_team_limit'), userPubkey.toBuffer()],
      this.programId
    );
  }

  async getTeamAgentPDA(teamId: number, agentId: number): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [
        Buffer.from('team_agent'),
        new BN(teamId).toArrayLike(Buffer, 'le', 8),
        new BN(agentId).toArrayLike(Buffer, 'le', 8)
      ],
      this.programId
    );
  }

  async getTrainingDataPDA(agentId: number, timestamp: number): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [
        Buffer.from('training_data'),
        new BN(agentId).toArrayLike(Buffer, 'le', 8),
        new BN(timestamp).toArrayLike(Buffer, 'le', 8)
      ],
      this.programId
    );
  }

  // ===== Agent相关方法 =====

  async initializeRegistry(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [registryPDA] = await this.getRegistryPDA();
    
    // 先检查registry是否已经存在
    try {
      const registryAccount = await this.program.account.agentRegistry.fetch(registryPDA);
      console.log('Registry already exists:', registryAccount);
      return 'Registry already initialized';
    } catch (error) {
      // Registry不存在，继续初始化
      console.log('Registry does not exist, initializing...');
    }
    
    console.log('🔧 Creating registry initialization transaction...');
    const transaction = await this.program.methods
      .initializeRegistry()
      .accounts({
        authority: this.provider.wallet.publicKey,
        registry: registryPDA,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });
    
    console.log('✅ Registry initialization transaction sent:', tx);
    
    // 异步确认交易，但不阻塞返回
    this.confirmTransactionInBackground(tx);
    
    return tx;
  }

  async registerAgent(agentData: AgentData, onConfirm?: (success: boolean, error?: any) => void): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [registryPDA] = await this.getRegistryPDA();
    
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      try {
        // 获取当前的agentCounter，确保与合约逻辑保持一致
        let registryAccount;
        try {
          registryAccount = await this.program.account.agentRegistry.fetch(registryPDA);
          console.log('Registry found:', registryAccount);
        } catch (e) {
          console.log('Registry not initialized, attempting to initialize...');
          try {
            await this.initializeRegistry();
            console.log('Registry initialized successfully');
            // 重新获取注册表数据
            registryAccount = await this.program.account.agentRegistry.fetch(registryPDA);
          } catch (initError) {
            console.error('Failed to initialize registry:', initError);
            throw new Error('Registry not initialized and could not initialize it');
          }
        }
        
        // 重要：使用当前counter值和用户地址生成唯一的PDA
        const currentCounter = registryAccount.agentCounter.toNumber();
        const userPubkey = this.provider.wallet.publicKey;
        console.log(`Using agent counter: ${currentCounter} and user: ${userPubkey.toBase58()} for PDA generation, retry: ${retries}`);
        
        const [agentPDA] = await this.getAgentPDA(currentCounter, userPubkey);
        
        // 检查该PDA是否已经存在
        try {
          const existingAgent = await this.program.account.agent.fetch(agentPDA);
          console.log(`Agent PDA ${agentPDA.toBase58()} already exists with data:`, existingAgent);
          console.log('Will retry with different ID...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          retries++;
          continue;
        } catch (e) {
          // 不存在，可以继续创建
          console.log(`PDA ${agentPDA.toBase58()} is available, proceeding with creation`);
        }
        
        // 创建 agent 注册交易
        console.log('🔧 Creating agent registration transaction...');
        const transaction = await this.program.methods
          .registerAgent(
            agentData.name,
            agentData.description,
            agentData.agentType,
            agentData.ipfsHash,
            agentData.imageUrl || ''
          )
          .accounts({
            user: this.provider.wallet.publicKey,
            registry: registryPDA,
            agent: agentPDA,
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
          skipPreflight: true,
          preflightCommitment: 'processed',
          maxRetries: 3
        });
        
        console.log('✅ Agent registration transaction sent:', tx);
        console.log('🔗 View on explorer: https://explorer.solana.com/tx/' + tx + '?cluster=devnet');
        
        // 异步确认交易，但不阻塞返回
        console.log('🔄 Starting background confirmation for tx:', tx);
        if (onConfirm) {
          console.log('✓ onConfirm callback provided, will notify UI');
          this.confirmTransactionInBackground(tx, onConfirm);
        } else {
          console.log('⚠️ No onConfirm callback provided');
          this.confirmTransactionInBackground(tx);
        }
        
        return tx;
      } catch (error) {
        if (error.message?.includes('already in use') && retries < maxRetries - 1) {
          console.log('Account already in use, retrying...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries++;
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Failed to register agent after multiple retries');
  }

  async updateAgent(
    agentId: number,
    updates: Partial<Omit<AgentData, 'ipfsHash'>>
  ): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [agentPDA] = await this.getAgentPDA(agentId);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .updateAgent(
        updates.name || null,
        updates.description || null,
        updates.agentType || null,
        updates.imageUrl || null
      )
      .accounts({
        user: this.provider.wallet.publicKey,
        agent: agentPDA,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async toggleAgentPublic(agentId: number): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [agentPDA] = await this.getAgentPDA(agentId);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .toggleAgentPublic()
      .accounts({
        user: this.provider.wallet.publicKey,
        agent: agentPDA,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async addTrainingData(
    agentId: number,
    ipfsHash: string,
    dataType: string
  ): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [agentPDA] = await this.getAgentPDA(agentId);
    const timestamp = Math.floor(Date.now() / 1000);
    const [trainingDataPDA] = await this.getTrainingDataPDA(agentId, timestamp);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .addTrainingData(ipfsHash, dataType)
      .accounts({
        user: this.provider.wallet.publicKey,
        agent: agentPDA,
        trainingData: trainingDataPDA,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  // ===== 团队相关方法 =====

  async initializeTeamRegistry(teamFeeSol: number, treasuryPubkey: PublicKey): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [teamRegistryPDA] = await this.getTeamRegistryPDA();

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .initializeTeamRegistry(new BN(teamFeeSol * LAMPORTS_PER_SOL))
      .accounts({
        authority: this.provider.wallet.publicKey,
        teamRegistry: teamRegistryPDA,
        treasury: treasuryPubkey,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async initializeUserLimit(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .initializeUserLimit()
      .accounts({
        user: this.provider.wallet.publicKey,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  // 使用新的SolanaTeamRegistry合约注册团队
  async registerSolanaTeam(teamUuid: string, name: string, description: string, agents: Array<{id: number, role: string}>, onConfirm?: (success: boolean, error?: any) => void): Promise<string> {
    if (!this.teamProgram || !this.provider) {
      throw new Error('Team program not initialized or wallet not connected');
    }

    // 获取团队注册表PDA
    const [teamRegistryPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("team_registry")],
      this.teamProgramId
    );

    // 获取团队注册表账户信息，如果不存在则先初始化
    let teamRegistryAccount;
    let teamCount = 0;
    
    try {
      teamRegistryAccount = await this.teamProgram.account.teamRegistry.fetch(teamRegistryPDA);
      teamCount = teamRegistryAccount.teamCounter.toNumber();
    } catch (error) {
      console.log('Team registry not initialized, initializing...');
      // 先初始化团队注册表
      console.log('🔧 Creating team registry initialization transaction...');
      const initTransaction = await this.teamProgram.methods
        .initializeTeamRegistry()
        .accounts({
          authority: this.provider.wallet.publicKey,
          teamRegistry: teamRegistryPDA,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // 设置最新的blockhash
      const latestBlockhash = await this.connection.getLatestBlockhash();
      initTransaction.recentBlockhash = latestBlockhash.blockhash;
      initTransaction.feePayer = this.provider.wallet.publicKey;

      // 签名交易
      const signedInitTransaction = await this.provider.wallet.signTransaction(initTransaction);
      
      // 发送已签名的交易
      const initTx = await this.connection.sendRawTransaction(signedInitTransaction.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'processed',
        maxRetries: 3
      });
      
      console.log('✅ Team registry initialization transaction sent:', initTx);
      
      // 异步确认初始化交易
      this.confirmTransactionInBackground(initTx);
      
      // 重新获取账户信息
      teamRegistryAccount = await this.teamProgram.account.teamRegistry.fetch(teamRegistryPDA);
      teamCount = teamRegistryAccount.teamCounter.toNumber();
    }

    // 获取团队PDA
    const teamCountBuffer = Buffer.alloc(8);
    teamCountBuffer.writeBigUInt64LE(BigInt(teamCount), 0);
    const [teamPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("team"), teamCountBuffer],
      this.teamProgramId
    );

    // 转换agents格式
    const agentRoles = agents.map(agent => ({
      id: new BN(agent.id),
      role: agent.role
    }));

    // 创建交易而不是直接发送
    const transaction = await this.teamProgram.methods
      .registerTeam(teamUuid, name, description, agentRoles)
      .accounts({
        user: this.provider.wallet.publicKey,
        teamRegistry: teamRegistryPDA,
        team: teamPDA,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    // 设置最新的blockhash
    console.log('🚀 Preparing team registration transaction...');
    const latestBlockhash = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = this.provider.wallet.publicKey;

    // 签名交易
    const signedTransaction = await this.provider.wallet.signTransaction(transaction);
    
    // 发送已签名的交易
    console.log('📡 Sending team registration transaction...');
    const tx = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    console.log('✅ Team registration transaction sent:', tx);
    console.log('🔗 View on explorer: https://explorer.solana.com/tx/' + tx + '?cluster=devnet');
    
    // 异步确认团队注册交易
    console.log('🔄 Starting background confirmation for team registration tx:', tx);
    if (onConfirm) {
      console.log('✓ onConfirm callback provided for team registration, will notify UI');
      this.confirmTransactionInBackground(tx, onConfirm);
    } else {
      console.log('⚠️ No onConfirm callback provided for team registration');
      this.confirmTransactionInBackground(tx);
    }

    return tx;
  }

  // 保持原有的createTeam方法用于向后兼容
  async createTeam(teamData: TeamData): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [teamRegistryPDA] = await this.getTeamRegistryPDA();
    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);
    
    const teamRegistryAccount = await this.program.account.teamRegistry.fetch(teamRegistryPDA);
    const teamCount = teamRegistryAccount.teamCounter.toNumber();
    const [teamPDA] = await this.getTeamPDA(teamCount);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .createTeam(teamData.teamUuid, teamData.name, teamData.description)
      .accounts({
        user: this.provider.wallet.publicKey,
        teamRegistry: teamRegistryPDA,
        userLimit: userLimitPDA,
        team: teamPDA,
        treasury: teamRegistryAccount.treasury,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async addAgentToTeam(teamId: number, agentId: number, role: string): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [teamPDA] = await this.getTeamPDA(teamId);
    const [agentPDA] = await this.getAgentPDA(agentId);
    const [teamAgentPDA] = await this.getTeamAgentPDA(teamId, agentId);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .addAgentToTeam(new BN(agentId), role)
      .accounts({
        user: this.provider.wallet.publicKey,
        team: teamPDA,
        agent: agentPDA,
        teamAgent: teamAgentPDA,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async removeAgentFromTeam(teamId: number, agentId: number): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [teamPDA] = await this.getTeamPDA(teamId);
    const [teamAgentPDA] = await this.getTeamAgentPDA(teamId, agentId);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .removeAgentFromTeam(new BN(agentId))
      .accounts({
        user: this.provider.wallet.publicKey,
        team: teamPDA,
        teamAgent: teamAgentPDA,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  async purchaseTeamSlot(): Promise<string> {
    if (!this.program || !this.provider) {
      throw new Error('Wallet not connected or program not initialized');
    }

    const [teamRegistryPDA] = await this.getTeamRegistryPDA();
    const [userLimitPDA] = await this.getUserTeamLimitPDA(this.provider.wallet.publicKey);
    const teamRegistryAccount = await this.program.account.teamRegistry.fetch(teamRegistryPDA);

    // 创建交易而不是直接发送
    const transaction = await this.program.methods
      .purchaseTeamSlot()
      .accounts({
        user: this.provider.wallet.publicKey,
        teamRegistry: teamRegistryPDA,
        userLimit: userLimitPDA,
        treasury: teamRegistryAccount.treasury,
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
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 3
    });

    return tx;
  }

  // ===== 查询方法 =====

  async getUserAgents(userPubkey?: PublicKey): Promise<SolanaAgent[]> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const user = userPubkey || this.provider?.wallet.publicKey;
    if (!user) {
      throw new Error('No user public key provided');
    }
    
    const agents = await this.program.account.agent.all([
      {
        memcmp: {
          offset: 8 + 8, // discriminator + id
          bytes: user.toBase58(),
        },
      },
    ]);

    return agents.map(agent => ({
      id: agent.account.id.toNumber(),
      owner: agent.account.owner.toBase58(),
      name: agent.account.name,
      description: agent.account.description,
      agentType: agent.account.agentType,
      ipfsHash: agent.account.ipfsHash,
      imageUrl: agent.account.imageUrl,
      isPublic: agent.account.isPublic,
      createdAt: agent.account.createdAt.toNumber(),
      updatedAt: agent.account.updatedAt.toNumber(),
    }));
  }

  async getUserTeams(userPubkey?: PublicKey): Promise<SolanaTeam[]> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const user = userPubkey || this.provider?.wallet.publicKey;
    if (!user) {
      throw new Error('No user public key provided');
    }
    
    const teams = await this.program.account.team.all([
      {
        memcmp: {
          offset: 8 + 8 + 40, // discriminator + id + team_uuid(36) + padding
          bytes: user.toBase58(),
        },
      },
    ]);

    return teams.map(team => ({
      id: team.account.id.toNumber(),
      teamUuid: team.account.teamUuid,
      owner: team.account.owner.toBase58(),
      name: team.account.name,
      description: team.account.description,
      agentCount: team.account.agentCount,
      maxAgents: team.account.maxAgents,
      isActive: team.account.isActive,
      createdAt: team.account.createdAt.toNumber(),
      updatedAt: team.account.updatedAt.toNumber(),
    }));
  }

  async getAgent(agentId: number): Promise<SolanaAgent> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [agentPDA] = await this.getAgentPDA(agentId);
    const agent = await this.program.account.agent.fetch(agentPDA);

    return {
      id: agent.id.toNumber(),
      owner: agent.owner.toBase58(),
      name: agent.name,
      description: agent.description,
      agentType: agent.agentType,
      ipfsHash: agent.ipfsHash,
      imageUrl: agent.imageUrl,
      isPublic: agent.isPublic,
      createdAt: agent.createdAt.toNumber(),
      updatedAt: agent.updatedAt.toNumber(),
    };
  }

  async getTeam(teamId: number): Promise<SolanaTeam> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [teamPDA] = await this.getTeamPDA(teamId);
    const team = await this.program.account.team.fetch(teamPDA);

    return {
      id: team.id.toNumber(),
      teamUuid: team.teamUuid,
      owner: team.owner.toBase58(),
      name: team.name,
      description: team.description,
      agentCount: team.agentCount,
      maxAgents: team.maxAgents,
      isActive: team.isActive,
      createdAt: team.createdAt.toNumber(),
      updatedAt: team.updatedAt.toNumber(),
    };
  }

  async getTeamAgents(teamId: number): Promise<TeamAgent[]> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const teamAgents = await this.program.account.teamAgent.all([
      {
        memcmp: {
          offset: 8, // discriminator
          bytes: new BN(teamId).toArrayLike(Buffer, 'le', 8),
        },
      },
    ]);

    return teamAgents.map(teamAgent => ({
      teamId: teamAgent.account.teamId.toNumber(),
      agentId: teamAgent.account.agentId.toNumber(),
      role: teamAgent.account.role,
      addedAt: teamAgent.account.addedAt.toNumber(),
    }));
  }

  async getUserTeamLimit(userPubkey?: PublicKey): Promise<{ teamLimit: number; teamsCreated: number }> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const user = userPubkey || this.provider?.wallet.publicKey;
    if (!user) {
      throw new Error('No user public key provided');
    }

    const [userLimitPDA] = await this.getUserTeamLimitPDA(user);
    
    try {
      const userLimit = await this.program.account.userTeamLimit.fetch(userLimitPDA);
      return {
        teamLimit: userLimit.teamLimit,
        teamsCreated: userLimit.teamsCreated,
      };
    } catch (error) {
      // 如果账户不存在，返回默认值
      return {
        teamLimit: 1,
        teamsCreated: 0,
      };
    }
  }

  async getAgentTrainingData(agentId: number): Promise<any[]> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const trainingData = await this.program.account.trainingData.all([
      {
        memcmp: {
          offset: 8, // discriminator
          bytes: new BN(agentId).toArrayLike(Buffer, 'le', 8),
        },
      },
    ]);

    return trainingData.map(data => ({
      agentId: data.account.agentId.toNumber(),
      ipfsHash: data.account.ipfsHash,
      dataType: data.account.dataType,
      timestamp: data.account.timestamp.toNumber(),
    }));
  }

  // ===== 工具方法 =====

  async getAccountBalance(pubkey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  async confirmTransaction(signature: string): Promise<void> {
    const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }
  }

  // 事件监听方法
  addEventListener(eventName: string, callback: (event: any) => void): number {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    return this.program.addEventListener(eventName, callback);
  }

  removeEventListener(listenerId: number): Promise<void> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    return this.program.removeEventListener(listenerId);
  }
}