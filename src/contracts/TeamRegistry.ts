import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

const TeamRegistryABI: AbiItem[] = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "u",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_rev",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "_buyamount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_buyamount_usdt",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "_zc",
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
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "TeamRegistered",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			}
		],
		"name": "TeamUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "buyer",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "blocktime",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "payamount",
				"type": "uint256"
			}
		],
		"name": "buyteamlog",
		"type": "event"
	},
	{
		"stateMutability": "payable",
		"type": "fallback"
	},
	{
		"inputs": [],
		"name": "buyteamamount",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "buyteamamount_usdt",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			}
		],
		"name": "getTeam",
		"outputs": [
			{
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "describe",
				"type": "string"
			},
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "role",
						"type": "string"
					}
				],
				"internalType": "struct TeamRegistry_zc.Agent[]",
				"name": "agents",
				"type": "tuple[]"
			},
			{
				"internalType": "bool",
				"name": "isActive",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "describe",
				"type": "string"
			},
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "role",
						"type": "string"
					}
				],
				"internalType": "struct TeamRegistry_zc.Agent[]",
				"name": "agents",
				"type": "tuple[]"
			},
			{
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			}
		],
		"name": "registerTeam",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_buyamount",
				"type": "uint256"
			}
		],
		"name": "setbuyamount",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_buyamount_usdt",
				"type": "uint256"
			}
		],
		"name": "setbuyamount_usdt",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
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
				"name": "describe",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			},
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "role",
						"type": "string"
					}
				],
				"internalType": "struct TeamRegistry_zc.Agent[]",
				"name": "agents",
				"type": "tuple[]"
			}
		],
		"name": "updateTeam",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"stateMutability": "payable",
		"type": "receive"
	}
];

const ZCTeamRegistryABI: AbiItem[] = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "u",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_rev",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_owner",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "addteamCounter",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "add",
				"type": "address"
			}
		],
		"name": "adduserTeamCount",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			}
		],
		"name": "delteams",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getteamCounter",
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
				"internalType": "string",
				"name": "teamid",
				"type": "string"
			}
		],
		"name": "getteams",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "name",
						"type": "string"
					},
					{
						"internalType": "address",
						"name": "owner",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "describe",
						"type": "string"
					},
					{
						"components": [
							{
								"internalType": "uint256",
								"name": "id",
								"type": "uint256"
							},
							{
								"internalType": "string",
								"name": "role",
								"type": "string"
							}
						],
						"internalType": "struct TeamRegistry_zc.Agent[]",
						"name": "agents",
						"type": "tuple[]"
					},
					{
						"internalType": "bool",
						"name": "isActive",
						"type": "bool"
					}
				],
				"internalType": "struct TeamRegistry_zc.Team",
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
				"name": "add",
				"type": "address"
			}
		],
		"name": "getuserTeamCount",
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
				"name": "add",
				"type": "address"
			}
		],
		"name": "getuserteamlimit",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
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
				"name": "describe",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "_owner",
				"type": "address"
			},
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "role",
						"type": "string"
					}
				],
				"internalType": "struct TeamRegistry_zc.Agent[]",
				"name": "_agents",
				"type": "tuple[]"
			},
			{
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			}
		],
		"name": "setteams",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "add",
				"type": "address"
			},
			{
				"internalType": "uint8",
				"name": "sz",
				"type": "uint8"
			}
		],
		"name": "setuserteamlimit",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "teams",
		"outputs": [
			{
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "describe",
				"type": "string"
			},
			{
				"internalType": "bool",
				"name": "isActive",
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
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "transferFrom",
		"outputs": [
			{
				"internalType": "bool",
				"name": "success",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_Owner",
				"type": "address"
			}
		],
		"name": "updateOwner",
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
		"inputs": [
			{
				"internalType": "string",
				"name": "_name",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "describe",
				"type": "string"
			},
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "id",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "role",
						"type": "string"
					}
				],
				"internalType": "struct TeamRegistry_zc.Agent[]",
				"name": "_agents",
				"type": "tuple[]"
			},
			{
				"internalType": "string",
				"name": "teamId",
				"type": "string"
			}
		],
		"name": "updateteams",
		"outputs": [],
		"stateMutability": "nonpayable",
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
		"name": "userTeamCount",
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
				"name": "",
				"type": "address"
			}
		],
		"name": "userteamlimit",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

export interface Agent {
  id: number;
  role: string;
}

export interface Team {
  name: string;
  owner: string;
  agents: Agent[];
  isActive: boolean;
}

const getAddress = (id: number) => {
	switch(id) {
		case 56:
		  return { 
			TeamRegistry: '0xAf4c9E6517cd7Eb05A6e1f8BB4eCDc4ae26d1700',  
			ZCTeamRegistry: '0x617cD0c3f52ECc0dF0D3E3B28D2e9aa40Ef57FD0'
		  };
		case 97:
		  return { 
			TeamRegistry: '0xc9348016269482641131f02BAeBEcbD2ad1f6Bf4',  
			ZCTeamRegistry: '0x8e7ebCb62EE35F9A1C79f5eE910799c6C7828699'
		  };
		case 137:
		  return {
			TeamRegistry: '0x29419e7A61F2A6E895ebED9b39A0D881C4efcb2b',  
			ZCTeamRegistry: '0x4CE3bB16bd6E075eb5889240d21EE1c9332E3F6f'
		  };
		case 42161:
			return {
				TeamRegistry: '0xD3904549972c0F39BB3f6c7c3ecAAeeE09E7DCDb',  
				ZCTeamRegistry: '0xc2BD50a009cBDa10561F3EA50362Ec29C092600A'
			  };
		case 50312: 
			return {
				TeamRegistry: '0x029e691B83477901fACaaBDD6Fb9E20713E668C2',  
				ZCTeamRegistry: '0xAD1Ea5C3e7daA9C433ba18EdEd8F947D6Ee74aDd'
			};
		default:
		  return {};
	  }
}

const getpriceLimit = (id: number) => {
	switch(id) {
	  case 97:
		return '2000000'  // Unified string type to avoid BigInt mixing
	  case 137:
		return '2000000'  // Unified string type to avoid BigInt mixing
	  case 42161:
		return '2000000'  // Unified string type to avoid BigInt mixing
	  case 50312:
		return '2000000'  // Unified string type to avoid BigInt mixing
	  default:
		return '2000000000000000000'
	}
}
  
export class TeamRegistry {
  private web3: Web3;
  private contract: any;
  private zcContract: any;
  private Id: number

  constructor(web3: Web3, chainId: number) {
    this.web3 = web3;
	this.Id = chainId
    this.contract = new web3.eth.Contract(TeamRegistryABI, getAddress(chainId)?.TeamRegistry);
    this.zcContract = new web3.eth.Contract(ZCTeamRegistryABI, getAddress(chainId)?.ZCTeamRegistry);
  }

  async checkNetworkCongestion() {
    try {
      // 简化版本：只检查当前gas价格，避免兼容性问题
      const gasPrice = await this.web3.eth.getGasPrice();
      const gasPriceGwei = Number(gasPrice) / 1e9;
      
      // 基于gas价格简单估算拥堵情况
      let congestionScore = 0.3; // 默认中等拥堵
      
      if (gasPriceGwei > 50) {
        congestionScore = 0.8; // 高拥堵
      } else if (gasPriceGwei > 20) {
        congestionScore = 0.5; // 中等拥堵
      } else {
        congestionScore = 0.2; // 低拥堵
      }

      return {
        congestionScore,
        suggestedTimeout: Math.max(60000, congestionScore * 300000), // 60秒到5分钟
        gasMultiplier: 1 + (congestionScore * 0.3) // 1到1.3倍 gas
      };
    } catch (error) {
      console.warn('Failed to check network congestion:', error);
      return {
        congestionScore: 0.5,
        suggestedTimeout: 180000, // 默认3分钟
        gasMultiplier: 1.2 // 默认1.2倍 gas
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

  async getUserTeamLimit(address: string): Promise<number> {
    try {
      const limit = await this.zcContract.methods.getuserteamlimit(address).call();
      return Number(limit);
    } catch (error) {
      console.error('Error getting user team limit:', error);
      throw error;
    }
  }

  async getUserTeamCount(address: string): Promise<number> {
    try {
      const count = await this.zcContract.methods.getuserTeamCount(address).call();
      return Number(count);
    } catch (error) {
      console.error('Error getting user team count:', error);
      throw error;
    }
  }

  async buyTeamAmount(from: string): Promise<string> {
    try {
      const weiValue = '3000000000000000'; // Convert to string to avoid BigInt mixing error
      
      const gasEstimate = await this.contract.methods
        .buyteamamount()
        .estimateGas({ from, value: weiValue });

      const gasPrice = await this.web3.eth.getGasPrice();

      const tx = await this.contract.methods
        .buyteamamount()
        .send({
          from,
          gas: Math.round(Number(gasEstimate) * 1.1),
          gasPrice: gasPrice.toString(),
		  value: weiValue
        });

      return tx.transactionHash;
    } catch (error) {
      console.error('Error buying team amount:', error);
      throw error;
    }
  }

  async buyTeamAmount_usdt(from: string): Promise<string> {
	const MAX_RETRIES = 1;
    let currentRetry = 0;
	while (currentRetry < MAX_RETRIES) {
	  try {
		  // 获取网络状态
		  const networkStatus = await this.checkNetworkCongestion();
		  console.log('Network congestion score:', networkStatus.congestionScore);
		  
		  // 获取 gas 预估
		  const gasEstimate = await this.contract.methods
        	.buyteamamount_usdt()
        	.estimateGas({ from });
  
		  // 获取优化后的 gas 价格
		  const gasPrice = await this.getOptimalGasPrice();
  
		  // 设置交易超时
		  const timeout = networkStatus.suggestedTimeout;
		  console.log(`Setting transaction timeout to ${timeout}ms`);
  
		  // 发送交易
		  const txPromise = this.contract.methods
		  .buyteamamount_usdt()
		  .send({
			from,
			gas: Math.round(Number(gasEstimate) * 1.1),
			gasPrice: gasPrice.toString()
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

  async registerTeam(name: string, describe: string, agents: any, from: string , teamsId: string): Promise<any> {
    const MAX_RETRIES = 1;
    let currentRetry = 0;
	while (currentRetry < MAX_RETRIES) {
	  try {
		  // 获取网络状态
		  const networkStatus = await this.checkNetworkCongestion();
		  console.log('Network congestion score:', networkStatus.congestionScore);
		  
		  // 获取 gas 预估
		  const gasEstimate = await this.contract.methods
        	.registerTeam(name, describe, agents, teamsId)
        	.estimateGas({ from });
  
		  // 获取优化后的 gas 价格
		  const gasPrice = await this.getOptimalGasPrice();
  
		  // 设置交易超时
		  const timeout = networkStatus.suggestedTimeout;
		  console.log(`Setting transaction timeout to ${timeout}ms`);
  
		  // 发送交易
		  const txPromise = this.contract.methods
		  .registerTeam(name, describe, agents, teamsId)
		  .send({
			from,
			gas: Math.round(Number(gasEstimate) * 1.1),
			gasPrice: gasPrice.toString()
		  });
  
		  // 使用 Promise.race 实现超时控制
		  const tx = await Promise.race([
			txPromise,
			new Promise((_, reject) => {
			  setTimeout(() => reject(new Error('Transaction timeout')), timeout);
			})
		  ]);

		  const teamId = Number(tx.events.TeamRegistered.returnValues.teamId);
		  return {
			id: teamId,
			hash: tx.transactionHash
		  };
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

  async updateTeam(name: string, describe: string, teamId: string, agents: any, from: string): Promise<string> {
    try {
      const team = await this.getTeam(teamId);
      
      if (!team.isActive) {
        throw new Error('Team is not active');
      }

      if (team.owner.toLowerCase() !== from.toLowerCase()) {
        throw new Error('Not team owner');
      }

      if (agents.length > 5) {
        throw new Error('Maximum agent limit is 5');
      }

      const gasEstimate = await this.contract.methods
        .updateTeam(name, describe, teamId, agents)
        .estimateGas({ from });

      const gasPrice = await this.web3.eth.getGasPrice();

      const tx = await this.contract.methods
        .updateTeam(name, describe, teamId, agents)
        .send({
          from,
          gas: Math.round(Number(gasEstimate) * 1.1),
          gasPrice: gasPrice.toString()
        });

      return tx.transactionHash;
    } catch (error) {
      console.error('Error updating team:', error);
      throw error;
    }
  }

  async getTeam(teamId: string): Promise<Team> {
    try {

      const data = await this.contract.methods.getTeam(teamId).call();
	  return {
        name: data.name,
        owner: data.owner,
        agents: data.agents,
        isActive: data.isActive
      };
    } catch (error) {
      console.error('Error getting team:', error);
      throw error;
    }
  }

  async getTeamCounter(): Promise<number> {
    try {
      const counter = await this.zcContract.methods.getteamCounter().call();
      return Number(counter);
    } catch (error) {
      console.error('Error getting team counter:', error);
      throw error;
    }
  }

  async setBuyAmount(from: string): Promise<string> {
    try {
      const gasEstimate = await this.contract.methods
        .setbuyamount_usdt(getpriceLimit(this.Id))
        .estimateGas({ from });

      const gasPrice = await this.web3.eth.getGasPrice();

      const tx = await this.contract.methods
        .setbuyamount_usdt(getpriceLimit(this.Id))
        .send({
          from,
          gas: Math.round(Number(gasEstimate) * 1.1),
          gasPrice: gasPrice.toString()
        });

      return tx.transactionHash;
    } catch (error) {
      console.error('Error setting buy amount:', error);
      throw error;
    }
  }

}
