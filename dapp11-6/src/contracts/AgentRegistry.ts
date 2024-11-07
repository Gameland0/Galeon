import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

const AgentRegistryABI: AbiItem[] = [
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
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "bool",
				"name": "isPublic",
				"type": "bool"
			}
		],
		"name": "AgentPublicityToggled",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			}
		],
		"name": "AgentRegistered",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "description",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "agentType",
				"type": "string"
			}
		],
		"name": "AgentUpdated",
		"type": "event"
	},
	{
		"inputs": [
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
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "agentId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "ipfsHash",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "TrainingDataAdded",
		"type": "event"
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
	},
	{
		"inputs": [],
		"name": "agentCount",
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
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "agents",
		"outputs": [
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
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "agentTrainingData",
		"outputs": [
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
		"stateMutability": "view",
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
				"internalType": "struct AgentRegistry.Agent",
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
				"internalType": "struct AgentRegistry.TrainingData[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
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

export class AgentRegistry {
  private web3: Web3;
  private contract: any;

  constructor(web3: Web3) {
    this.web3 = web3;
    this.contract = new web3.eth.Contract(AgentRegistryABI, '0x2F4813bF41E6576C69b7126e6D71483a39e3E7bD');
  }

  async registerAgent(name: string, description: string, agentType: string, ipfsHash: string, from: string): Promise<any> {
    try {
      const gasEstimate = await this.contract.methods.registerAgent(name, description, agentType, ipfsHash).estimateGas({ from });
      const gasPrice = await this.web3.eth.getGasPrice();
      
      const tx = await this.contract.methods.registerAgent(name, description, agentType, ipfsHash).send({
        from,
        gas: Math.round(gasEstimate * 1.1),
        gasPrice
      });
  
      // 从交易收据中获取新代理的ID
      const agentId = Number(tx.events.AgentRegistered.returnValues.id);
      console.log('New agent registered with ID:', agentId);
      return {
        id: agentId,
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

