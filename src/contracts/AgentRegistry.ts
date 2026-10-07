import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

const AgentRegistryABI: AbiItem[] = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "aaz",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_agentId",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "_ipfsHash",
				"type": "string"
			}
		],
		"name": "addTrainingData",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"internalType": "string[]",
				"name": "_name",
				"type": "string[]"
			},
			{
				"internalType": "string[]",
				"name": "_description",
				"type": "string[]"
			},
			{
				"internalType": "string[]",
				"name": "_agentType",
				"type": "string[]"
			},
			{
				"internalType": "string[]",
				"name": "_ipfsHash",
				"type": "string[]"
			}
		],
		"name": "betchregisterAgent",
		"outputs": [
			{
				"internalType": "uint256[]",
				"name": "",
				"type": "uint256[]"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_id",
				"type": "uint256"
			}
		],
		"name": "getAgent",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "owner",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "name",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "description",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "agentType",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "ipfsHash",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "isPublic",
						"type": "bool"
					}
				],
				"internalType": "struct AgentRegistry_zc.Agent",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getAgentCount",
		"outputs": [
			{
				"internalType": "uint256[]",
				"name": "",
				"type": "uint256[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_agentId",
				"type": "uint256"
			}
		],
		"name": "getAgentTrainingData",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "ipfsHash",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct AgentRegistry_zc.TrainingData[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "_name",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_description",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_agentType",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_ipfsHash",
				"type": "string"
			}
		],
		"name": "registerAgent",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_id",
				"type": "uint256"
			}
		],
		"name": "toggleAgentPublicity",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_id",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "_name",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_description",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_agentType",
				"type": "string"
			}
		],
		"name": "updateAgent",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

interface Agent {
  name: string;
  description: string;
  agentType: string;
  ipfsHash: string;
  owner: string;
  createdAt: number;
  isPublic: boolean;
}

interface TrainingData {
  ipfsHash: string;
  timestamp: number;
}

interface AgentDetails {
  agent: Agent;
  trainingData: TrainingData[];
}

const getAddress = (id: number) => {
	switch(id) {
		case 56:
		  return '0x2D0f7E6E57A552fC44419399EcB2678d6fA10875'
		case 97:
		  return '0x719a511cE4d20192ed94A8abCFbE13736f98Bc53'
		case 137:
		  return '0x37c881e765F74d176e5fb5D559da324af72788Be'
		case 42161: 
		  return '0xC1Cc174B1711714a254b164db4987c115CB8f9cF'
		case 50312: 
		  return '0x1d35a11A76211A7D0556bbaBe2dE03891eb06f10'
		default:
		  return '';
	  }
}

export class AgentRegistry {
  private web3: Web3;
  private contract: any;
  private MAX_RETRIES: any
  constructor(web3: Web3, chainId: number) {
    this.web3 = web3;
    this.contract = new web3.eth.Contract(AgentRegistryABI, getAddress(chainId));
	this.MAX_RETRIES = 1;
  }

  async checkNetworkCongestion() {
    try {
      const currentBlockRaw = await this.web3.eth.getBlockNumber();
      const currentBlock = Number(currentBlockRaw);
      const lastBlocks = await Promise.all(
        [...Array(5).keys()].map(i => this.web3.eth.getBlock(currentBlock - i))
      );
  
      const avgGasUsed = lastBlocks.reduce((sum, block) => {
        const gasUsed = Number((block as any).gasUsed || 0);
        const gasLimit = Number((block as any).gasLimit || 1);
        return sum + (gasUsed / gasLimit);
      }, 0) / (lastBlocks.length || 1);
      
      const pendingTxs: any = (this.web3.eth as any).getPendingTransactions
        ? await (this.web3.eth as any).getPendingTransactions()
        : [];
      const pendingCount = Array.isArray(pendingTxs) ? pendingTxs.length : 0;

      const congestionScore = Math.min(
        (avgGasUsed * 0.7) + (pendingCount / 1000 * 0.3),
        1
      );

      return {
        congestionScore,
        suggestedTimeout: Math.max(60000, Math.floor(congestionScore * 300000)),
        gasMultiplier: 1 + (congestionScore * 0.5)
      };
    } catch (error) {
      console.warn('Failed to check network congestion:', error);
      return {
        congestionScore: 0.5,
        suggestedTimeout: 180000,
        gasMultiplier: 1.25
      };
    }
  }

  async getOptimalGasPrice() {
    try {
      const baseGasPrice = await this.web3.eth.getGasPrice();
      const networkStatus = await this.checkNetworkCongestion();
      const scaled = BigInt(Math.floor(100 * networkStatus.gasMultiplier));
      const optimalGasPrice = (BigInt(baseGasPrice) * scaled) / BigInt(100);
      return optimalGasPrice.toString();
    } catch (error) {
      console.warn('Error getting optimal gas price:', error);
      return await this.web3.eth.getGasPrice();
    }
  }

  async registerAgent(id: number, name: string, description: string, agentType: string, ipfsHash: string, from: string): Promise<any> {
    let currentRetry = 0;
	while (currentRetry < this.MAX_RETRIES) {
	  try {
		  const networkStatus = await this.checkNetworkCongestion();
		  console.log('Network congestion score:', networkStatus.congestionScore);
		  
		  const gasEstimate = await this.contract.methods
        	.registerAgent(id,name, description, agentType, ipfsHash)
        	.estimateGas({ from });
  
		  const gasPrice = await this.getOptimalGasPrice();
		  
		  const timeout = networkStatus.suggestedTimeout;
		  console.log(`Setting transaction timeout to ${timeout}ms`);
  
		  const txPromise = this.contract.methods
		  .registerAgent(id,name, description, agentType, ipfsHash)
		  .send({
			from,
			gas: Math.round(Number(gasEstimate) * 1.1),
			gasPrice
		  });
  
		  const tx = await Promise.race([
			txPromise,
			new Promise((_, reject) => {
			  setTimeout(() => reject(new Error('Transaction timeout')), timeout);
			})
		  ]);
		  return {
			hash: (tx as any).transactionHash
		  };
  
	  } catch (error: any) {
		  currentRetry++;
		  console.warn(`Transaction attempt ${currentRetry} failed:`, error);
  
		  if (currentRetry === this.MAX_RETRIES) {
			throw new Error(`Transaction failed after ${this.MAX_RETRIES} attempts: ${error.message}`);
		  }
		  const retryDelay = Math.min(1000 * Math.pow(2, currentRetry), 10000);
		  console.log(`Retrying in ${retryDelay}ms...`);
		  await new Promise(resolve => setTimeout(resolve, retryDelay));
	  }
	}

	throw new Error('Transaction failed after all retry attempts');
  }

  async toggleAgentPublicity(agentId: number, from: string) {
    try {
      const gasEstimate = await this.contract.methods.toggleAgentPublicity(agentId).estimateGas({ from });
      const gasPrice = await this.web3.eth.getGasPrice();
      const tx = await this.contract.methods.toggleAgentPublicity(agentId).send({
        from,
        gas: Math.round(Number(gasEstimate) * 1.1),
        gasPrice
      });

      return tx;
    } catch (error) {
      console.error('Error in toggleAgentPublicity:', error);
      throw error;
    }
  }

  async addTrainingData(agentId: number, ipfsHash: string, from: string) {
    let currentRetry = 0;
	while (currentRetry < this.MAX_RETRIES) {
	  try {
		  const networkStatus = await this.checkNetworkCongestion();
		  console.log('Network congestion score:', networkStatus.congestionScore);
		  
		  const gasEstimate = await this.contract.methods
        	.addTrainingData(agentId, ipfsHash)
        	.estimateGas({ from });
  
		  const gasPrice = await this.getOptimalGasPrice();
  
		  const timeout = networkStatus.suggestedTimeout;
		  console.log(`Setting transaction timeout to ${timeout}ms`);
  
		  const txPromise = this.contract.methods
		  .addTrainingData(agentId, ipfsHash)
		  .send({
			from,
			gas: Math.round(Number(gasEstimate) * 1.1),
			gasPrice
		  });
  
		  const tx = await Promise.race([
			txPromise,
			new Promise((_, reject) => {
			  setTimeout(() => reject(new Error('Transaction timeout')), timeout);
			})
		  ]);
  
		  const event = (tx as any).events?.TrainingDataAdded;
		  if (event) {
			const { ipfsHash, timestamp } = event.returnValues;
			return { ipfsHash, timestamp: new Date(Number(timestamp) * 1000) };
		  }
		  return (tx as any).transactionHash;
  
	  } catch (error: any) {
		  currentRetry++;
		  console.warn(`Transaction attempt ${currentRetry} failed:`, error);
  
		  if (currentRetry === this.MAX_RETRIES) {
			throw new Error(`Transaction failed after ${this.MAX_RETRIES} attempts: ${error.message}`);
		  }
		  const retryDelay = Math.min(1000 * Math.pow(2, currentRetry), 10000);
		  console.log(`Retrying in ${retryDelay}ms...`);
		  await new Promise(resolve => setTimeout(resolve, retryDelay));
	  }
	}

	throw new Error('Transaction failed after all retry attempts');
  }

  async getAgent(agentId: number): Promise<AgentDetails> {
    try {
      const result = await this.contract.methods.getAgent(agentId).call();
      return {
        agent: {
          name: result.agent.name,
          description: result.agent.description,
          agentType: result.agent.agentType,
          ipfsHash: result.agent.ipfsHash,
          owner: result.agent.owner,
          createdAt: Number(result.agent.createdAt),
          isPublic: result.agent.isPublic
        },
        trainingData: result.trainingData.map((data: any) => ({
          ipfsHash: data.ipfsHash,
          timestamp: Number(data.timestamp)
        }))
      };
    } catch (error) {
      console.error('Error in getAgent:', error);
      throw error;
    }
  }

  async getAgentCount(): Promise<number> {
    try {
      const count = await this.contract.methods.getAgentCount().call();
      return Number(count);
    } catch (error) {
      console.error('Error in getAgentCount:', error);
      throw error;
    }
  }

  async getUserAgents(userAddress: string): Promise<number[]> {
    try {
      const agentIds = await this.contract.methods.getUserAgents(userAddress).call();
      return agentIds.map(Number);
    } catch (error) {
      console.error('Error in getUserAgents:', error);
      throw error;
    }
  }
}

