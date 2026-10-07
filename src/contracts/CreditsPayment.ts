import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
const CreditsPaymentV2Contract = require('./CreditsPaymentV2.json');
const CreditsPaymentV2ABI = CreditsPaymentV2Contract.abi;

const CreditsPaymentABI: AbiItem[] = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_cp",
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
		"name": "togglePlan",
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
			}
		],
		"name": "updatePlan",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

const CreditsPaymentZcABI: AbiItem[] = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_usdtToken",
				"type": "address"
			},
			{
				"internalType": "address payable",
				"name": "_rev",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "previousOwner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "OwnershipTransferred",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "Paused",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "planId",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "bool",
				"name": "active",
				"type": "bool"
			}
		],
		"name": "PlanStatusChanged",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "planId",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "credits",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			}
		],
		"name": "PlanUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "bytes32",
				"name": "planId",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "credits",
				"type": "uint256"
			}
		],
		"name": "SubscriptionPurchased",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "Unpaused",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "CREDIT_PRICE",
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
				"internalType": "bytes32",
				"name": "planId",
				"type": "bytes32"
			}
		],
		"name": "getPlanDetails",
		"outputs": [
			{
				"components": [
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
				"internalType": "struct CreditsPayment.Plan",
				"name": "",
				"type": "tuple"
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
				"components": [
					{
						"internalType": "uint256",
						"name": "totalcredits",
						"type": "uint256"
					},
					{
						"components": [
							{
								"internalType": "uint256",
								"name": "buytime",
								"type": "uint256"
							},
							{
								"internalType": "bytes32",
								"name": "planname",
								"type": "bytes32"
							},
							{
								"internalType": "uint256",
								"name": "credits",
								"type": "uint256"
							}
						],
						"internalType": "struct CreditsPayment.buyRecord[]",
						"name": "brlist",
						"type": "tuple[]"
					}
				],
				"internalType": "struct CreditsPayment.buyRecordlist",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "pause",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "paused",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
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
		"name": "purchaseSubscription",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "renounceOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "",
				"type": "bytes32"
			}
		],
		"name": "subscriptionPlans",
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
				"internalType": "bytes32",
				"name": "planId",
				"type": "bytes32"
			}
		],
		"name": "togglePlan",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "unpause",
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
				"internalType": "address",
				"name": "_controler",
				"type": "address"
			}
		],
		"name": "updatecontroler",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_gove",
				"type": "address"
			}
		],
		"name": "updategove",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "usdtToken",
		"outputs": [
			{
				"internalType": "contract IERC20",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "userCredits",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "totalcredits",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

const getAddress = (id: number) => {
	switch(id) {
		case 56:
		  return {
			CreditsPayment: '0xF4271BCC87fC0F783cdB5ee647EbEf964306039b',  
			ZCCreditsPayment: '0xFa3e281f2a0c6EC95fF93c9A0A9b4D2A93151A84'
		  };
		case 97:
		  return { 
			CreditsPayment: '0xCf2d49E34b3F510b014a618F01E8c1ECCD1d664C',  
			ZCCreditsPayment: '0x1C2F8ea711bd336A284A3e99Af4779e40a1eD142'
		  };
		case 137:
		  return {
			CreditsPayment: '0x3fB4B4817210e07C2f594A636A037d803669491E',  // CreditsPaymentV2
			ZCCreditsPayment: '0x3fB4B4817210e07C2f594A636A037d803669491E'  // CreditsPaymentV2
		};
		case 42161:
			return {};
		default:
		  return {};
	  }
}

export class CreditsPaymentContract {
  private web3: Web3;
  private contract: any;
  private zcContract: any;
  
  constructor(web3: Web3, chainId: number) {
    this.web3 = web3;
    this.contract = new web3.eth.Contract(CreditsPaymentABI, getAddress(chainId)?.CreditsPayment);
    // 使用 V2 ABI
    this.zcContract = new web3.eth.Contract(CreditsPaymentV2ABI as AbiItem[], getAddress(chainId)?.ZCCreditsPayment);
  }

  async purchaseCredits(from: string, amount: number): Promise<string> {
    const gasEstimate = await this.contract.methods
      .purchaseCredits(amount)
      .estimateGas({ from });

    const gasPrice = await this.web3.eth.getGasPrice();

    const tx = await this.contract.methods
      .purchaseCredits(amount)
      .send({
        from,
        gas: Math.round(gasEstimate * 1.1),
        gasPrice
      });

    return tx.transactionHash;
  }

  async checkNetworkCongestion() {
    try {
      const currentBlock = await this.web3.eth.getBlockNumber();
      const lastBlocks = await Promise.all(
        [...Array(3).keys()].map(i =>
          this.web3.eth.getBlock(Number(currentBlock) - i)
        )
      );
  
      // 计算最近区块的平均 gas 使用率
      const avgGasUsed = lastBlocks.reduce((sum, block) => 
        sum + (Number(block.gasUsed) / Number(block.gasLimit)), 0) / lastBlocks.length;
      
      // 简化拥堵评估，减少对待处理交易的依赖
      let congestionScore = avgGasUsed; // 主要基于gas使用率
      
      // 只有当gas使用率很高时才考虑待处理交易
      if (avgGasUsed > 0.8) {
        try {
          const pendingTxs = await this.web3.eth.getPendingTransactions();
          const pendingCount = pendingTxs.length;
          // 减少待处理交易对拥堵分数的影响
          congestionScore = Math.min(avgGasUsed + (pendingCount / 2000 * 0.2), 1);
        } catch (error) {
          // 如果获取待处理交易失败，仅使用gas使用率
          console.warn('Failed to get pending transactions:', error);
        }
      }

      // 设置更合理的gas倍数范围：1.0到1.2倍，而不是1.0到1.5倍
      const gasMultiplier = 1 + (congestionScore * 0.2); // 最大20%增加而不是50%

      return {
        congestionScore,
        suggestedTimeout: Math.max(60000, congestionScore * 180000), // 减少最大超时从5分钟到3分钟
        gasMultiplier
      };
    } catch (error) {
      console.warn('Failed to check network congestion:', error);
      return {
        congestionScore: 0.3, // 降低默认拥堵分数
        suggestedTimeout: 120000, // 减少默认超时从3分钟到2分钟
        gasMultiplier: 1.1 // 降低默认倍数从1.25到1.1
      };
    }
  }

  async getOptimalGasPrice() {
    try {
      const baseGasPrice = await this.web3.eth.getGasPrice();
      const networkStatus = await this.checkNetworkCongestion();
      
      // 使用更保守的gas价格计算
      // 当网络拥堵时，优先使用更高的gas价格而不是过高的gas limit
      const optimalGasPrice = BigInt(baseGasPrice) * 
        BigInt(Math.floor(100 * networkStatus.gasMultiplier)) / 
        BigInt(100);

      return optimalGasPrice.toString();
    } catch (error) {
      console.warn('Error getting optimal gas price:', error);
      // 在出错时使用基础gas价格加5%而不是原始价格
      const baseGasPrice = await this.web3.eth.getGasPrice();
      const safeGasPrice = BigInt(baseGasPrice) * BigInt(105) / BigInt(100);
      return safeGasPrice.toString();
    }
  }

async purchaseSubscription(planType: string, from: string): Promise<string> {
    const MAX_RETRIES = 1;
    let currentRetry = 0;

    while (currentRetry < MAX_RETRIES) {
      try {
        // 获取网络状态
        const networkStatus = await this.checkNetworkCongestion();
        console.log('Network congestion score:', networkStatus.congestionScore);

        // 计算 planId
        const planId = this.web3.utils.keccak256(planType);
        
        // 获取 gas 预估
        const gasEstimate = await this.contract.methods
          .purchaseSubscription(planId)
          .estimateGas({ from });

        // 获取优化后的 gas 价格
        const gasPrice = await this.getOptimalGasPrice();

        // 设置交易超时
        const timeout = networkStatus.suggestedTimeout;
        console.log(`Setting transaction timeout to ${timeout}ms`);

        // 发送交易
        const txPromise = this.contract.methods
          .purchaseSubscription(planId)
          .send({
            from,
            gas: Math.round(gasEstimate * networkStatus.gasMultiplier),
            gasPrice
          });

        // 使用 Promise.race 实现超时控制
        const tx = await Promise.race([
          txPromise,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Transaction timeout')), timeout);
          })
        ]);

        return tx.transactionHash;

      } catch (error: any) {
        currentRetry++;
        console.warn(`Transaction attempt ${currentRetry} failed:`, error);

        if (currentRetry === MAX_RETRIES) {
          throw new Error(`Transaction failed after ${MAX_RETRIES} attempts: ${error.message}`);
        }

        // 计算重试延迟时间
        const retryDelay = Math.min(1000 * Math.pow(2, currentRetry), 10000);
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    throw new Error('Transaction failed after all retry attempts');
  }

  async getUserCredits(address: string): Promise<number> {
    return this.zcContract.methods.getUserCredits(address).call();
  }

  async getPlanDetails(planType: 'BASIC' | 'PRO'): Promise<{
    credits: number;
    price: number;
    active: boolean;
  }> {
    const planId = this.web3.utils.keccak256(planType);
    const plan = await this.zcContract.methods.getPlanDetails(planId).call();
    return {
      credits: Number(plan.credits),
      price: Number(plan.price) / 10**6, // Convert from USDT decimals
      active: plan.active
    };
  }

  // ========== V2 合约方法 (使用数字ID) ==========

  /**
   * 将套餐名称转换为 V2 合约的数字ID
   * BASIC -> 1 (Basic Package)
   * PRO -> 2 (Standard Package)
   * DEV -> 3 (Premium Package)
   */
  private getPlanIdV2(planType: 'BASIC' | 'PRO' | 'DEV'): number {
    const planMapping: { [key: string]: number } = {
      'BASIC': 1,
      'PRO': 2,
      'DEV': 3
    };
    return planMapping[planType] || 1;
  }

  /**
   * 使用 V2 合约购买 Credits
   * @param planType 套餐类型 ('BASIC', 'PRO', 'DEV')
   * @param from 购买者地址
   * @returns 交易哈希
   */
  async purchaseCreditsV2(planType: 'BASIC' | 'PRO' | 'DEV', from: string): Promise<string> {
    const MAX_RETRIES = 1;
    let currentRetry = 0;

    // 获取套餐ID
    const packageId = this.getPlanIdV2(planType);

    while (currentRetry < MAX_RETRIES) {
      try {
        // 获取网络状态
        const networkStatus = await this.checkNetworkCongestion();
        console.log('Network congestion score:', networkStatus.congestionScore);

        // 获取 gas 预估
        const gasEstimate = await this.zcContract.methods
          .purchaseCredits(packageId)
          .estimateGas({ from });

        // 获取优化后的 gas 价格
        const gasPrice = await this.getOptimalGasPrice();

        // 设置交易超时
        const timeout = networkStatus.suggestedTimeout;
        console.log(`Setting transaction timeout to ${timeout}ms`);

        // 发送交易
        const txPromise = this.zcContract.methods
          .purchaseCredits(packageId)
          .send({
            from,
            gas: Math.round(Number(gasEstimate) * networkStatus.gasMultiplier),
            gasPrice: gasPrice.toString()
          });

        // 使用 Promise.race 实现超时控制
        const tx = await Promise.race([
          txPromise,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Transaction timeout')), timeout);
          })
        ]);

        return (tx as any).transactionHash;

      } catch (error: any) {
        currentRetry++;
        console.warn(`Transaction attempt ${currentRetry} failed:`, error);

        if (currentRetry === MAX_RETRIES) {
          throw new Error(`Purchase failed: ${error.message}`);
        }

        // 计算重试延迟时间
        const retryDelay = Math.min(1000 * Math.pow(2, currentRetry), 10000);
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    throw new Error('Transaction failed after all retry attempts');
  }

  /**
   * 获取 V2 合约的套餐详情
   */
  async getCreditPackageV2(planType: 'BASIC' | 'PRO' | 'DEV'): Promise<{
    id: number;
    name: string;
    credits: number;
    price: number;
    isActive: boolean;
  } | null> {
    try {
      const packageId = this.getPlanIdV2(planType);
      const pkg = await this.zcContract.methods.creditPackages(packageId).call();

      return {
        id: Number(pkg.id),
        name: pkg.name,
        credits: Number(pkg.credits),
        price: Number(pkg.price) / 10**6, // USDT 6位小数
        isActive: pkg.isActive
      };
    } catch (error) {
      console.error('Failed to get package details:', error);
      return null;
    }
  }

  /**
   * 获取 V2 合约的所有可用套餐
   */
  async getAllPackagesV2(): Promise<Array<{
    id: string;
    name: string;
    credits: number;
    price: number;
    priceWei: string;
    active: boolean;
    costPerCredit: number;
  }>> {
    try {
      const planTypes: Array<'BASIC' | 'PRO' | 'DEV'> = ['BASIC', 'PRO', 'DEV'];
      const packages = [];

      for (const planType of planTypes) {
        const pkg = await this.getCreditPackageV2(planType);
        if (pkg && pkg.isActive) {
          packages.push({
            id: planType,
            name: pkg.name,
            credits: pkg.credits,
            price: pkg.price,
            priceWei: (pkg.price * 10**6).toString(), // 转换回 wei (6位小数)
            active: pkg.isActive,
            costPerCredit: pkg.price / pkg.credits
          });
        }
      }

      return packages;
    } catch (error) {
      console.error('Failed to get all packages:', error);
      return [];
    }
  }
}

