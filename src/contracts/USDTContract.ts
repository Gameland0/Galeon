import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import BigNumber from 'bignumber.js';

const ABI: AbiItem[] = [
	{
		"inputs": [],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "Approval",
		"type": "event"
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
				"indexed": true,
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			}
		],
		"name": "Transfer",
		"type": "event"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "_decimals",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "_name",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "_symbol",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			}
		],
		"name": "allowance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "approve",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "burn",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "decimals",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "subtractedValue",
				"type": "uint256"
			}
		],
		"name": "decreaseAllowance",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "getOwner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "address",
				"name": "spender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "addedValue",
				"type": "uint256"
			}
		],
		"name": "increaseAllowance",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "mint",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "name",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [],
		"name": "renounceOwnership",
		"outputs": [],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "symbol",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "totalSupply",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "address",
				"name": "recipient",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "transfer",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "address",
				"name": "sender",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "recipient",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "transferFrom",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

const getAddress = (id: number) => {
	switch(id) {
		case 56:
		  return '0x55d398326f99059fF775485246999027B3197955'
		case 97:
		  return '0x87c0141CC6D6Ec2cE5eC056Ecf75441BFa93Bd1c'
		case 137:
		  return '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
		case 42161:
		  return '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
		case 50312: 
		  return '0x18da12d0346b5129C363d355B0765952652FD390'
		default:
		  return '';
	  }
}

const CreditsPaymentgetAddress = (id: number) => {
	switch(id) {
		case 56:
		  return '0x55d398326f99059fF775485246999027B3197955'
		case 97:
		  return '0x2031949eD41889431D1F27F823530F366Ad61933'
		case 137: // Polygon Mainnet - 更新为新的订阅合约地址
		  return '0xb9F62aB3d3a1de606EC713bd3dABE1Ff65d8Cdfa'
		case 42161:
		  return '0x0000000000000000000000000000000000000000' // 预留：Arbitrum
		case 50312: 
		  return '0x18da12d0346b5129C363d355B0765952652FD390'
		default:
		  return '';
	  }
}

const approveAddress = (id: number) => {
	switch(id) {
		case 56:
		  return '0x617cD0c3f52ECc0dF0D3E3B28D2e9aa40Ef57FD0'
		case 97:
		  return '0x8e7ebCb62EE35F9A1C79f5eE910799c6C7828699'
		case 137:
		  return '0x4CE3bB16bd6E075eb5889240d21EE1c9332E3F6f'
		case 42161:
		  return '0xc2BD50a009cBDa10561F3EA50362Ec29C092600A'
		case 50312: 
		  return '0xAD1Ea5C3e7daA9C433ba18EdEd8F947D6Ee74aDd'
		default:
		  return '';
	  }
}

const CreditsPaymentApproveAddress = (id: number) => {
	switch(id) {
		case 56:
		  return '0xFa3e281f2a0c6EC95fF93c9A0A9b4D2A93151A84'
		case 97:
		  return '0x1C2F8ea711bd336A284A3e99Af4779e40a1eD142'
		case 137:
		  return '0x2E36bA49B9d89019cd7289056ba50806E0BAcE2e'
		case 42161:
		  return ''
		default:
		  return '';
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



export class USDTContract {
  private web3: Web3;
  private contract: any;
  private CreditsPaymentcontract: any;
  private Id: number
  
  constructor(web3: Web3, chainId: number) {
    this.web3 = web3;
    this.contract = new web3.eth.Contract(ABI, getAddress(chainId));
	// 使用真正的 USDT 合约地址，而不是错误的 CreditsPaymentgetAddress
	this.CreditsPaymentcontract = new web3.eth.Contract(ABI, getAddress(chainId));
	this.Id = chainId
  }

  async Approve (from: string) {
    const gasEstimate = await this.contract.methods.approve(approveAddress(this.Id),getpriceLimit(this.Id)).estimateGas({ from });
    const gasPrice = await this.web3.eth.getGasPrice();
      
    const tx = await this.contract.methods.approve(approveAddress(this.Id),getpriceLimit(this.Id)).send({
        from,
        gas: Math.round(Number(gasEstimate) * 1.1),
        gasPrice: gasPrice.toString()
    });
  }

  async CreditsPaymentApprove (Limit: any, from: string) {
    // 获取正确的 SubscriptionContract 地址作为授权目标
    const subscriptionContractAddress = this.getSubscriptionContractAddress(this.Id);
    
    const gasEstimate = await this.CreditsPaymentcontract.methods.approve(subscriptionContractAddress, Limit).estimateGas({ from });
    const gasPrice = await this.web3.eth.getGasPrice();
      
    const tx = await this.CreditsPaymentcontract.methods.approve(subscriptionContractAddress, Limit).send({
        from,
        gas: Math.round(Number(gasEstimate) * 1.1),
        gasPrice: gasPrice.toString()
    });
    
    return tx;
  }
  
  // 获取用户USDT余额
  async getBalance(address: string): Promise<number> {
    try {
      const balance = await this.CreditsPaymentcontract.methods.balanceOf(address).call();
      return Number(balance);
    } catch (error) {
      console.error('Error fetching USDT balance:', error);
      return 0;
    }
  }
  
  // 获取 SubscriptionContract 地址
  private getSubscriptionContractAddress(chainId: number): string {
    switch(chainId) {
      case 137: // Polygon Mainnet
        return '0x3fB4B4817210e07C2f594A636A037d803669491E'; // CreditsPaymentV2 地址
      default:
        throw new Error(`SubscriptionContract not deployed on chain ${chainId}`);
    }
  }
}