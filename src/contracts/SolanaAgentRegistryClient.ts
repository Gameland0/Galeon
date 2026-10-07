import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN, Idl } from '@project-serum/anchor';
import { Buffer } from 'buffer';

// 导入IDL
import solanaAgentRegistryIdl from '../idl/solana_agent_registry.json';
import solanaTeamRegistryIdl from '../idl/solana_team_registry.json';
import solanaTeamSlotPurchaseIdl from '../idl/solana_team_slot_purchase.json';

// 合约地址 - 更新为新部署的程序地址
export const SOLANA_PROGRAM_IDS = {
  AGENT_REGISTRY: 'DHU9UBVaZNtw77FabwS7JmCxrgnNPA6Zg18xBPfB3rZ', // 最新部署的程序地址
  TEAM_REGISTRY: 'AgZZ8oQ37eimRFusxJGJuSTpQwkBKRfDa8scVWBxfviH', // 暂时保留原地址
  SLOT_PURCHASE: 'H7HaNptFbTxm4E2s7vdpaPFQFwdLT49YK7Z6BffxiuWm' // 已确认可执行的程序
};

export interface SolanaAgent {
  id: BN;
  owner: PublicKey;
  name: string;
  description: string;
  agentType: string;
  ipfsHash: string;
  isPublic: boolean;
  createdAt: BN;
}

export interface SolanaTeam {
  id: BN;
  owner: PublicKey;
  name: string;
  description: string;
  agentIds: BN[];
  roles: string[];
  isPublic: boolean;
  createdAt: BN;
}

// 简单的钱包适配器，适配现有的Phantom钱包逻辑
class PhantomWalletAdapter {
  private provider: any;
  
  constructor() {
    this.provider = (window as any).solana;
    if (!this.provider) {
      throw new Error('Phantom wallet not found');
    }
  }
  
  get publicKey() {
    return this.provider.publicKey;
  }
  
  async signTransaction(transaction: any) {
    return await this.provider.signTransaction(transaction);
  }
  
  async signAllTransactions(transactions: any[]) {
    return await this.provider.signAllTransactions(transactions);
  }
}

export class SolanaAgentRegistryClient {
  private connection: Connection;
  private wallet: PhantomWalletAdapter;
  private agentProgram: Program<Idl>;
  private teamProgram: Program<Idl>;
  private slotProgram: Program<Idl>;

  constructor(connection: Connection) {
    this.connection = connection;
    this.wallet = new PhantomWalletAdapter();

    // 创建Provider
    const provider = new AnchorProvider(
      connection,
      this.wallet as any,
      { commitment: 'confirmed' }
    );

    // 初始化程序
    this.agentProgram = new Program(
      solanaAgentRegistryIdl as Idl,
      new PublicKey(SOLANA_PROGRAM_IDS.AGENT_REGISTRY),
      provider
    );

    this.teamProgram = new Program(
      solanaTeamRegistryIdl as Idl,
      new PublicKey(SOLANA_PROGRAM_IDS.TEAM_REGISTRY),
      provider
    );

    this.slotProgram = new Program(
      solanaTeamSlotPurchaseIdl as Idl,
      new PublicKey(SOLANA_PROGRAM_IDS.SLOT_PURCHASE),
      provider
    );
  }

  /**
   * 初始化Registry（如果还没有初始化）
   */
  async initializeRegistryIfNeeded(): Promise<void> {
    try {
      const [registryPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('registry')],
        this.agentProgram.programId
      );

      // 检查Registry是否已经存在
      try {
        await this.agentProgram.account.agentRegistry.fetch(registryPDA);
        console.log('Registry already initialized');
        return;
      } catch (error) {
        console.log('Registry not found, initializing...');
      }

      // 初始化Registry
      const tx = await this.agentProgram.methods
        .initializeRegistry()
        .accounts({
          authority: this.wallet.publicKey,
          registry: registryPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Registry initialized with signature:', tx);
    } catch (error) {
      console.error('Error initializing registry:', error);
      // 不抛出异常，因为可能是其他用户已经初始化了
    }
  }

  /**
   * 注册新Agent
   */
  async registerAgent(
    name: string,
    description: string,
    agentType: string,
    ipfsHash: string,
    imageUrl: string = ''
  ): Promise<string> {
    try {
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      // 确保Registry已初始化
      await this.initializeRegistryIfNeeded();

      console.log('🔍 SolanaAgentRegistryClient Debug:');
      console.log('- Program ID:', this.agentProgram.programId.toString());
      console.log('- Wallet Public Key:', this.wallet.publicKey.toString());
      console.log('- Agent Name:', name);

      // 生成Registry PDA
      const [registryPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('registry')],
        this.agentProgram.programId
      );
      console.log('- Registry PDA:', registryPDA.toString());

      // 生成Agent PDA
      const [agentPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('agent'),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(name) // 使用name作为seed
        ],
        this.agentProgram.programId
      );
      console.log('- Agent PDA:', agentPDA.toString());

      // 调用合约方法
      const tx = await this.agentProgram.methods
        .registerAgent(
          name,
          description,
          agentType,
          ipfsHash,
          imageUrl
        )
        .accounts({
          user: this.wallet.publicKey,
          registry: registryPDA,
          agent: agentPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc({
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });

      console.log('Agent registered with signature:', tx);
      return tx;

    } catch (error) {
      console.error('Error registering agent:', error);
      throw error;
    }
  }

  /**
   * 更新Agent信息
   */
  async updateAgent(
    agentId: number,
    name: string,
    description: string,
    agentType: string,
    ipfsHash: string
  ): Promise<string> {
    try {
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      const [agentPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('agent'),
          this.wallet.publicKey.toBuffer(),
          new BN(agentId).toArrayLike(Buffer, 'le', 8)
        ],
        this.agentProgram.programId
      );

      const tx = await this.agentProgram.methods
        .updateAgent(
          new BN(agentId),
          name,
          description,
          agentType,
          ipfsHash
        )
        .accounts({
          agent: agentPDA,
          owner: this.wallet.publicKey,
        })
        .rpc();

      console.log('Agent updated with signature:', tx);
      return tx;

    } catch (error) {
      console.error('Error updating agent:', error);
      throw error;
    }
  }

  /**
   * 切换Agent公开状态
   */
  async toggleAgentPublicity(agentId: number): Promise<string> {
    try {
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      const [agentPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('agent'),
          this.wallet.publicKey.toBuffer(),
          new BN(agentId).toArrayLike(Buffer, 'le', 8)
        ],
        this.agentProgram.programId
      );

      const tx = await this.agentProgram.methods
        .toggleAgentPublicity(new BN(agentId))
        .accounts({
          agent: agentPDA,
          owner: this.wallet.publicKey,
        })
        .rpc();

      console.log('Agent publicity toggled with signature:', tx);
      return tx;

    } catch (error) {
      console.error('Error toggling agent publicity:', error);
      throw error;
    }
  }

  /**
   * 获取Agent信息
   */
  async getAgent(agentId: number, ownerPublicKey: PublicKey): Promise<SolanaAgent> {
    try {
      const [agentPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('agent'),
          ownerPublicKey.toBuffer(),
          new BN(agentId).toArrayLike(Buffer, 'le', 8)
        ],
        this.agentProgram.programId
      );

      const agentAccount = await this.agentProgram.account.agent.fetch(agentPDA);
      
      return {
        id: agentAccount.id,
        owner: agentAccount.owner,
        name: agentAccount.name,
        description: agentAccount.description,
        agentType: agentAccount.agentType,
        ipfsHash: agentAccount.ipfsHash,
        isPublic: agentAccount.isPublic,
        createdAt: agentAccount.createdAt,
      };

    } catch (error) {
      console.error('Error fetching agent:', error);
      throw error;
    }
  }

  /**
   * 创建团队
   */
  async registerTeam(
    teamId: number,
    name: string,
    description: string,
    agentIds: number[],
    roles: string[]
  ): Promise<string> {
    try {
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      if (agentIds.length !== roles.length) {
        throw new Error('Agent IDs and roles arrays must have the same length');
      }

      if (agentIds.length < 2 || agentIds.length > 5) {
        throw new Error('Team must have between 2 and 5 agents');
      }

      const [teamPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('team'),
          this.wallet.publicKey.toBuffer(),
          new BN(teamId).toArrayLike(Buffer, 'le', 8)
        ],
        this.teamProgram.programId
      );

      const tx = await this.teamProgram.methods
        .registerTeam(
          new BN(teamId),
          name,
          description,
          agentIds.map(id => new BN(id)),
          roles
        )
        .accounts({
          team: teamPDA,
          owner: this.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Team registered with signature:', tx);
      return tx;

    } catch (error) {
      console.error('Error registering team:', error);
      throw error;
    }
  }

  /**
   * 获取用户的所有Agents
   */
  async getUserAgents(): Promise<SolanaAgent[]> {
    try {
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      // 获取所有agent账户
      const agentAccounts = await this.agentProgram.account.agent.all([
        {
          memcmp: {
            offset: 8, // 跳过discriminator
            bytes: this.wallet.publicKey.toBase58(),
          }
        }
      ]);

      return agentAccounts.map(account => ({
        id: account.account.id,
        owner: account.account.owner,
        name: account.account.name,
        description: account.account.description,
        agentType: account.account.agentType,
        ipfsHash: account.account.ipfsHash,
        isPublic: account.account.isPublic,
        createdAt: account.account.createdAt,
      }));

    } catch (error) {
      console.error('Error fetching user agents:', error);
      return [];
    }
  }

  /**
   * 获取用户的所有Teams
   */
  async getUserTeams(): Promise<SolanaTeam[]> {
    try {
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      const teamAccounts = await this.teamProgram.account.team.all([
        {
          memcmp: {
            offset: 8,
            bytes: this.wallet.publicKey.toBase58(),
          }
        }
      ]);

      return teamAccounts.map(account => ({
        id: account.account.id,
        owner: account.account.owner,
        name: account.account.name,
        description: account.account.description,
        agentIds: account.account.agentIds,
        roles: account.account.roles,
        isPublic: account.account.isPublic,
        createdAt: account.account.createdAt,
      }));

    } catch (error) {
      console.error('Error fetching user teams:', error);
      return [];
    }
  }
}