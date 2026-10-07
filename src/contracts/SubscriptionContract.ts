import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

const SubscriptionContractABI: AbiItem[] = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_usdtToken",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_treasury",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "planId",
        "type": "bytes32"
      }
    ],
    "name": "purchaseSubscription",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "planId",
        "type": "bytes32"
      }
    ],
    "name": "getPlanDetails",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "credits",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getUserCredits",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "consumeCredits",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "planId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "credits",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "updatePlan",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "planId",
        "type": "bytes32"
      }
    ],
    "name": "togglePlan",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// 订阅计划类型定义
export interface SubscriptionPlan {
  id: string;
  name: string;
  credits: number;
  price: number; // 以美元为单位
  priceWei: string; // 以USDT wei为单位 (6位小数)
  active: boolean;
  costPerCredit: number;
}

const getAddress = (id: number) => {
  switch(id) {
    // 只保留已部署合约的网络，避免空地址错误
    // Polygon 网络
    case 137: // Polygon Mainnet
      return '0x3fB4B4817210e07C2f594A636A037d803669491E'; // CreditsPaymentV2 地址
    
    // 其他网络暂时注释掉，等部署后再启用
    // // Ethereum 网络
    // case 1: // Ethereum Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：ETH主网合约地址
    // case 11155111: // Ethereum Sepolia Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：ETH Sepolia测试网
    // case 5: // Ethereum Goerli Testnet (deprecated but still used)
    //   return '0x0000000000000000000000000000000000000000'; // 预留：ETH Goerli测试网
    
    // // BNB Smart Chain 网络
    // case 56: // BSC Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：BSC主网合约地址
    // case 97: // BSC Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：BSC测试网合约地址
    
    // // Polygon 测试网络
    // case 80001: // Polygon Mumbai Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Polygon测试网
    
    // // Arbitrum 网络
    // case 42161: // Arbitrum One Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Arbitrum主网
    // case 421613: // Arbitrum Goerli Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Arbitrum测试网
    
    // // Optimism 网络
    // case 10: // Optimism Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Optimism主网
    // case 420: // Optimism Goerli Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Optimism测试网
    
    // // Avalanche 网络
    // case 43114: // Avalanche C-Chain Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Avalanche主网
    // case 43113: // Avalanche Fuji Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Avalanche测试网
    
    // // Base 网络
    // case 8453: // Base Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Base主网
    // case 84531: // Base Goerli Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Base测试网
    
    // // Fantom 网络
    // case 250: // Fantom Opera Mainnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Fantom主网
    // case 4002: // Fantom Testnet
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Fantom测试网
    
    // // 本地开发网络
    // case 31337: // Hardhat Network
    //   return '0x0000000000000000000000000000000000000000'; // 预留：本地开发网络
    // case 1337: // Ganache
    //   return '0x0000000000000000000000000000000000000000'; // 预留：Ganache本地网络
    
    default:
      return ''; // 未支持的网络返回空字符串，会触发错误提示用户切换网络
  }
}

export class SubscriptionContract {
  private web3: Web3;
  private contract: any;
  private chainId: number;
  
  constructor(web3: Web3, chainId: number) {
    this.web3 = web3;
    this.chainId = chainId;
    
    // 不在构造函数中检查网络，允许创建实例
    // 只有在实际调用合约方法时才检查网络和合约地址
    this.contract = null; // 延迟初始化
  }
  
  /**
   * 获取合约实例（延迟初始化）
   */
  private getContractInstance() {
    if (this.contract) {
      return this.contract;
    }
    
    const contractAddress = this.getAddress(this.chainId);
    const networkName = this.getNetworkName(this.chainId);
    
    if (!contractAddress) {
      throw new Error(`Please switch to Polygon Mainnet to purchase credits. Current network: ${networkName} (Chain ID: ${this.chainId}) is not supported.`);
    }
    
    
    this.contract = new this.web3.eth.Contract(SubscriptionContractABI, contractAddress);
    return this.contract;
  }

  /**
   * 获取合约地址
   */
  private getAddress(chainId: number): string {
    return getAddress(chainId);
  }

  /**
   * 获取网络名称
   */
  private getNetworkName(chainId: number): string {
    switch(chainId) {
      // Ethereum 网络
      case 1: return 'Ethereum Mainnet';
      case 11155111: return 'Ethereum Sepolia Testnet';
      case 5: return 'Ethereum Goerli Testnet';
      
      // BNB Smart Chain 网络
      case 56: return 'BNB Smart Chain Mainnet';
      case 97: return 'BNB Smart Chain Testnet';
      
      // Polygon 网络
      case 137: return 'Polygon Mainnet';
      case 80001: return 'Polygon Mumbai Testnet';
      
      // Arbitrum 网络
      case 42161: return 'Arbitrum One Mainnet';
      case 421613: return 'Arbitrum Goerli Testnet';
      
      // Optimism 网络
      case 10: return 'Optimism Mainnet';
      case 420: return 'Optimism Goerli Testnet';
      
      // Avalanche 网络
      case 43114: return 'Avalanche C-Chain Mainnet';
      case 43113: return 'Avalanche Fuji Testnet';
      
      // Base 网络
      case 8453: return 'Base Mainnet';
      case 84531: return 'Base Goerli Testnet';
      
      // Fantom 网络
      case 250: return 'Fantom Opera Mainnet';
      case 4002: return 'Fantom Testnet';
      
      // 本地开发网络
      case 31337: return 'Hardhat Network';
      case 1337: return 'Ganache';
      
      default: return `Unknown Network (${chainId})`;
    }
  }

  /**
   * 获取所有可用的订阅计划
   */
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    const planTypes = ['BASIC', 'PRO', 'DEV'];
    const plans: SubscriptionPlan[] = [];

    // 如果不在支持的网络上，直接返回备用计划（不抛出错误）
    const contractAddress = this.getAddress(this.chainId);
    if (!contractAddress) {
      return this.getFallbackPlans();
    }

    // 先测试合约是否存在
    try {
      const code = await this.web3.eth.getCode(contractAddress);
      if (code === '0x') {
        return this.getFallbackPlans();
      }
    } catch (error) {
      return this.getFallbackPlans();
    }

    for (const planType of planTypes) {
      try {
        // 获取合约实例（延迟初始化）
        const contract = this.getContractInstance();
        
        // 使用和Solidity合约相同的方式生成planId
        const planId = this.web3.utils.keccak256(planType);
        
        const planDetails = await contract.methods.getPlanDetails(planId).call();
        
        // 正确处理BigInt数据
        const credits = Number(planDetails.credits);
        const priceWei = planDetails.price.toString();
        const price = Number(planDetails.price) / 1000000; // 6位小数的USDT
        const active = Boolean(planDetails.active);
        
        if (active && credits > 0) {
          plans.push({
            id: planType,
            name: this.getPlanDisplayName(planType),
            credits: credits,
            price: price,
            priceWei: priceWei,
            active: active,
            costPerCredit: price / credits
          });
        }
      } catch (error) {
        
      }
    }

    return plans.length > 0 ? plans : this.getFallbackPlans();
  }

  /**
   * 获取特定计划详情
   */
  async getPlanDetails(planType: 'BASIC' | 'PRO' | 'DEV'): Promise<SubscriptionPlan | null> {
    try {
      const contract = this.getContractInstance();
      const planId = this.web3.utils.keccak256(planType);
      const planDetails = await contract.methods.getPlanDetails(planId).call();
      
      if (!planDetails.active || planDetails.credits === '0') {
        return null;
      }

      const priceInUSDT = Number(planDetails.price) / 1000000;
      return {
        id: planType,
        name: this.getPlanDisplayName(planType),
        credits: Number(planDetails.credits),
        price: priceInUSDT,
        priceWei: planDetails.price,
        active: planDetails.active,
        costPerCredit: priceInUSDT / Number(planDetails.credits)
      };
    } catch (error) {
      
      return null;
    }
  }

  /**
   * 购买订阅
   */
  async purchaseSubscription(planType: 'BASIC' | 'PRO' | 'DEV', from: string): Promise<{
    transactionHash: string;
    credits: number;
    price: number;
  }> {
    try {
      // 先获取计划详情
      const plan = await this.getPlanDetails(planType);
      if (!plan) {
        throw new Error(`Plan ${planType} is not available`);
      }

      const planId = this.web3.utils.keccak256(planType);
      
      // 获取合约实例
      const contract = this.getContractInstance();

      // 估算Gas
      const gasEstimate = await contract.methods
        .purchaseSubscription(planId)
        .estimateGas({ from });

      // 获取Gas价格
      const gasPrice = await this.web3.eth.getGasPrice();

      // 发送交易
      const tx = await contract.methods
        .purchaseSubscription(planId)
        .send({
          from,
          gas: Math.round(Number(gasEstimate) * 1.2), // 20% buffer - 修复：显式转换 BigInt 为 Number
          gasPrice
        });

      return {
        transactionHash: tx.transactionHash,
        credits: plan.credits,
        price: plan.price
      };

    } catch (error: any) {
      throw new Error(`Purchase failed: ${error.message}`);
    }
  }

  /**
   * 获取用户Credits余额（从合约）
   */
  async getUserCredits(address: string): Promise<number> {
    try {
      const contract = this.getContractInstance();
      const balance = await contract.methods.getUserCredits(address).call();
      return Number(balance);
    } catch (error) {
      return 0;
    }
  }

  /**
   * 获取计划显示名称
   */
  private getPlanDisplayName(planType: string): string {
    switch (planType) {
      case 'BASIC': return 'Basic Plan';
      case 'PRO': return 'Pro Plan';
      case 'DEV': return 'Dev Plan';
      default: return planType;
    }
  }

  /**
   * 检查网络拥堵状态
   */
  async checkNetworkCongestion() {
    try {
      const currentBlock = await this.web3.eth.getBlockNumber();
      const currentBlockNumber = typeof currentBlock === 'bigint' ? Number(currentBlock) : currentBlock;
      
      const lastBlocks = await Promise.all(
        [...Array(3).keys()].map(i =>
          this.web3.eth.getBlock(currentBlockNumber - i)
        )
      );
  
      // 计算平均gas使用率
      const avgGasUsed = lastBlocks.reduce((sum, block) => {
        const gasUsed = typeof block.gasUsed === 'bigint' ? Number(block.gasUsed) : block.gasUsed;
        const gasLimit = typeof block.gasLimit === 'bigint' ? Number(block.gasLimit) : block.gasLimit;
        return sum + (gasUsed / gasLimit);
      }, 0) / lastBlocks.length;
      
      let congestionScore = avgGasUsed;
      let gasMultiplier = 1.1;
      let suggestedTimeout = 30000; // 30秒
      
      if (congestionScore > 0.8) {
        gasMultiplier = 1.5;
        suggestedTimeout = 60000; // 60秒
      } else if (congestionScore > 0.6) {
        gasMultiplier = 1.3;
        suggestedTimeout = 45000; // 45秒
      }
      
      return {
        congestionScore,
        gasMultiplier,
        suggestedTimeout
      };
    } catch (error) {
      
      return {
        congestionScore: 0.5,
        gasMultiplier: 1.2,
        suggestedTimeout: 30000
      };
    }
  }

  /**
   * 获取备用计划（当合约调用失败时使用）
   */
  private getFallbackPlans(): SubscriptionPlan[] {
    return [
      {
        id: 'BASIC',
        name: 'Basic Plan',
        credits: 100,
        price: 4.99,
        priceWei: '4990000',
        active: true,
        costPerCredit: 0.0499
      },
      {
        id: 'PRO',
        name: 'Pro Plan',
        credits: 500,
        price: 19.99,
        priceWei: '19990000',
        active: true,
        costPerCredit: 0.03998
      },
      {
        id: 'DEV',
        name: 'Dev Plan',
        credits: 1500,
        price: 49.99,
        priceWei: '49990000',
        active: true,
        costPerCredit: 0.03333
      }
    ];
  }
} 