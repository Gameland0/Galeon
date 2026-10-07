import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

// AgentEarningsManager ABI (核心函数)
const AgentEarningsManagerABI: AbiItem[] = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_creditsPaymentContract",
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
				"internalType": "bytes32",
				"name": "agentId",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
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
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "AgentCallRecorded",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "agentId",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "developer",
				"type": "address"
			}
		],
		"name": "AgentRegistered",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "batchSize",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "totalCredits",
				"type": "uint256"
			}
		],
		"name": "BatchRecorded",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "developer",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "EarningsWithdrawn",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32[]",
				"name": "agentIds",
				"type": "bytes32[]"
			},
			{
				"internalType": "address[]",
				"name": "users",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "credits",
				"type": "uint256[]"
			}
		],
		"name": "batchRecordAgentCalls",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "developer",
				"type": "address"
			}
		],
		"name": "calculateTotalEarnings",
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
				"name": "developer",
				"type": "address"
			}
		],
		"name": "getAvailableEarnings",
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
				"name": "agentId",
				"type": "bytes32"
			}
		],
		"name": "getAgentTotalEarnings",
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
				"name": "agentId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "developer",
				"type": "address"
			}
		],
		"name": "registerAgent",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "developer",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "verifyEarnings",
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
		"inputs": [],
		"name": "withdrawEarnings",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

// 根据链 ID 获取合约地址
const getAddress = (chainId: number): string | undefined => {
	switch(chainId) {
		case 137: // Polygon Mainnet
			return '0x76a96C06B7ac10a7863C51Ba2E935980c674E171';
		case 80001: // Polygon Mumbai (测试网)
			return undefined; // 如需要，可以部署测试网合约
		default:
			return undefined;
	}
};

export class AgentEarningsManagerContract {
	private web3: Web3;
	private contract: any;
	private chainId: number;

	constructor(web3: Web3, chainId: number) {
		this.web3 = web3;
		this.chainId = chainId;
		const address = getAddress(chainId);

		if (!address) {
			throw new Error(`AgentEarningsManager not deployed on chain ${chainId}`);
		}

		this.contract = new web3.eth.Contract(AgentEarningsManagerABI, address);
	}

	/**
	 * 注册 Agent（由服务器调用）
	 */
	async registerAgent(agentId: string, developer: string, from: string): Promise<string> {
		const agentIdHash = this.web3.utils.keccak256(agentId);

		const gasEstimate = await this.contract.methods
			.registerAgent(agentIdHash, developer)
			.estimateGas({ from });

		const gasPrice = await this.web3.eth.getGasPrice();

		const tx = await this.contract.methods
			.registerAgent(agentIdHash, developer)
			.send({
				from,
				gas: Math.round(gasEstimate * 1.2),
				gasPrice
			});

		return tx.transactionHash;
	}

	/**
	 * 批量记录 Agent 调用（由服务器定时调用）
	 */
	async batchRecordAgentCalls(
		agentIds: string[],
		users: string[],
		credits: number[],
		from: string
	): Promise<string> {
		if (agentIds.length !== users.length || users.length !== credits.length) {
			throw new Error('Array lengths must match');
		}

		const agentIdHashes = agentIds.map(id => this.web3.utils.keccak256(id));

		const gasEstimate = await this.contract.methods
			.batchRecordAgentCalls(agentIdHashes, users, credits)
			.estimateGas({ from });

		const gasPrice = await this.web3.eth.getGasPrice();

		const tx = await this.contract.methods
			.batchRecordAgentCalls(agentIdHashes, users, credits)
			.send({
				from,
				gas: Math.round(gasEstimate * 1.2),
				gasPrice
			});

		return tx.transactionHash;
	}

	/**
	 * 获取开发者可提现收益
	 */
	async getAvailableEarnings(developer: string): Promise<string> {
		const earnings = await this.contract.methods
			.getAvailableEarnings(developer)
			.call();

		// 返回 USDT 单位（6位小数）
		return this.web3.utils.fromWei(earnings, 'mwei'); // 1 mwei = 10^6 wei
	}

	/**
	 * 计算开发者总收益（从链上历史数据）
	 */
	async calculateTotalEarnings(developer: string): Promise<string> {
		const earnings = await this.contract.methods
			.calculateTotalEarnings(developer)
			.call();

		return this.web3.utils.fromWei(earnings, 'mwei');
	}

	/**
	 * 验证开发者收益是否正确
	 */
	async verifyEarnings(developer: string, amount: number): Promise<boolean> {
		const amountInWei = this.web3.utils.toWei(amount.toString(), 'mwei');

		return await this.contract.methods
			.verifyEarnings(developer, amountInWei)
			.call();
	}

	/**
	 * 提现收益
	 */
	async withdrawEarnings(from: string): Promise<string> {
		const gasEstimate = await this.contract.methods
			.withdrawEarnings()
			.estimateGas({ from });

		const gasPrice = await this.web3.eth.getGasPrice();

		const tx = await this.contract.methods
			.withdrawEarnings()
			.send({
				from,
				gas: Math.round(gasEstimate * 1.2),
				gasPrice
			});

		return tx.transactionHash;
	}

	/**
	 * 获取特定 Agent 的总收益
	 */
	async getAgentTotalEarnings(agentId: string): Promise<string> {
		const agentIdHash = this.web3.utils.keccak256(agentId);

		const earnings = await this.contract.methods
			.getAgentTotalEarnings(agentIdHash)
			.call();

		return this.web3.utils.fromWei(earnings, 'mwei');
	}

	/**
	 * 获取合约地址
	 */
	getContractAddress(): string {
		return this.contract.options.address;
	}
}

export default AgentEarningsManagerContract;
