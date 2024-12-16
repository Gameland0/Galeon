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
		  return '0x478672D421fd9827f1ee3F485AE2E4fbdDd68062'
		case 97:
		  return '0x719a511cE4d20192ed94A8abCFbE13736f98Bc53'
		case 137:
		  return '0x37c881e765F74d176e5fb5D559da324af72788Be'
		case 42161: 
		  return '0xC1Cc174B1711714a254b164db4987c115CB8f9cF'
		default:
		  return '';
	  }
}

export class AgentRegistry {
  private web3: Web3;
  private contract: any;

  constructor(web3: Web3, chainId: number) {
    this.web3 = web3;
    this.contract = new web3.eth.Contract(AgentRegistryABI, getAddress(chainId));
  }

  async registerAgent(id: number, name: string, description: string, agentType: string, ipfsHash: string, from: string): Promise<any> {
    try {
      const gasEstimate = await this.contract.methods.registerAgent(id,name, description, agentType, ipfsHash).estimateGas({ from });
      const gasPrice = await this.web3.eth.getGasPrice();

      const tx = await this.contract.methods.registerAgent(id, name, description, agentType, ipfsHash).send({
        from,
        gas: Math.round(gasEstimate * 1.1),
        gasPrice
      });
  
      // 从交易收据中获取新代理的ID
    //   const agentId = Number(tx.events.AgentRegistered.returnValues.id);
    //   console.log('New agent registered with ID:', agentId);
      return {
        // id: agentId,
        hash: tx.transactionHash
      };
	  
    } catch (error) {
      console.error('Error in registerAgent:', error);
      throw error;
    }
  }

  async toggleAgentPublicity(agentId: number, from: string) {
    try {
      const gasEstimate = await this.contract.methods.toggleAgentPublicity(agentId).estimateGas({ from });
      const gasPrice = await this.web3.eth.getGasPrice();
      
      const tx = await this.contract.methods.toggleAgentPublicity(agentId).send({
        from,
        gas: Math.round(gasEstimate * 1.1),
        gasPrice
      });

      return tx;
    } catch (error) {
      console.error('Error in toggleAgentPublicity:', error);
      throw error;
    }
  }

  async addTrainingData(agentId: number, ipfsHash: string, from: string) {
    try {
      const gasEstimate = await this.contract.methods.addTrainingData(agentId, ipfsHash).estimateGas({ from });
      const gasPrice = await this.web3.eth.getGasPrice();
      
      const tx = await this.contract.methods.addTrainingData(agentId, ipfsHash).send({
        from,
        gas: Math.round(gasEstimate * 1.1),
        gasPrice
      });

      const event = tx.events.TrainingDataAdded;
      if (event) {
        const { ipfsHash, timestamp } = event.returnValues;
        return { ipfsHash, timestamp: new Date(Number(timestamp) * 1000) };
      }

      return tx;
    } catch (error) {
      console.error('Error in addTrainingData:', error);
      throw error;
    }
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

