import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

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
			CreditsPayment: '0x0C7812f5bb2F9424FE18a22eaCE6e33d409A1201',  
			ZCCreditsPayment: '0xcF0ef8871FcfdFF27fB679e24087836243CBb19B'
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
    this.zcContract = new web3.eth.Contract(CreditsPaymentZcABI, getAddress(chainId)?.ZCCreditsPayment);
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
		[...Array(5).keys()].map(i => 
		  this.web3.eth.getBlock(currentBlock - i)
		)
	  );
  
      // 计算最近区块的平均 gas 使用率
      const avgGasUsed = lastBlocks.reduce((sum, block) => 
        sum + (block.gasUsed / block.gasLimit), 0) / lastBlocks.length;
      
      // 获取待处理交易数量
      const pendingTxs = await this.web3.eth.getPendingTransactions();
      const pendingCount = pendingTxs.length;

      // 计算网络拥堵分数 (0-1)
      const congestionScore = Math.min(
        (avgGasUsed * 0.7) + (pendingCount / 1000 * 0.3),
        1
      );

      // 根据拥堵情况返回建议的超时和 gas 价格
      return {
        congestionScore,
        suggestedTimeout: Math.max(60000, congestionScore * 300000), // 60秒到5分钟
        gasMultiplier: 1 + (congestionScore * 0.5) // 1到1.5倍 gas
      };
    } catch (error) {
      console.warn('Failed to check network congestion:', error);
      return {
        congestionScore: 0.5,
        suggestedTimeout: 180000, // 默认3分钟
        gasMultiplier: 1.25
      };
    }
  }

  async getOptimalGasPrice() {
    try {
      const baseGasPrice = await this.web3.eth.getGasPrice();
      const networkStatus = await this.checkNetworkCongestion();
      
      // 根据网络拥堵情况计算gas价格
      const optimalGasPrice = BigInt(baseGasPrice) * 
        BigInt(Math.floor(100 * networkStatus.gasMultiplier)) / 
        BigInt(100);

      return optimalGasPrice.toString();
    } catch (error) {
      console.warn('Error getting optimal gas price:', error);
      return await this.web3.eth.getGasPrice();
    }
  }

//   async purchaseSubscription(planType: any, from: string): Promise<string> {
//     const planId = this.web3.utils.keccak256(planType);
	
//     const gasEstimate = await this.contract.methods
//       .purchaseSubscription(planId)
//       .estimateGas({ from });
//     const gasPrice = await this.web3.eth.getGasPrice();
//     const tx = await this.contract.methods
//       .purchaseSubscription(planId)
//       .send({
//         from,
//         gas: Math.round(gasEstimate * 1.1),
//         gasPrice
//       });

//     return tx.transactionHash;
//   }

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
}

