const Web3 = require('web3');
const contractTemplates = require('../contractTemplates');

class BlockchainService {
  constructor() {
    this.web3 = new Web3(process.env.ETHEREUM_RPC_URL);
  }

  async deployContract(contractCode, chain) {
    // 这里应该根据选择的链来设置正确的 RPC URL
    this.setRpcUrl(chain);

    const accounts = await this.web3.eth.getAccounts();
    const contract = new this.web3.eth.Contract(JSON.parse(contractCode.abi));

    try {
      const deployedContract = await contract.deploy({
        data: contractCode.bytecode,
        arguments: [] // 如果构造函数需要参数，在这里添加
      }).send({
        from: accounts[0],
        gas: 1500000,
        gasPrice: '30000000000'
      });

      return {
        address: deployedContract.options.address,
        transactionHash: deployedContract.transactionHash
      };
    } catch (error) {
      console.error('Error deploying contract:', error);
      throw error;
    }
  }

  async estimateGas(contractCode, chain) {
    this.setRpcUrl(chain);

    const accounts = await this.web3.eth.getAccounts();
    const contract = new this.web3.eth.Contract(JSON.parse(contractCode.abi));

    try {
      const gas = await contract.deploy({
        data: contractCode.bytecode,
        arguments: [] // 如果构造函数需要参数，在这里添加
      }).estimateGas({
        from: accounts[0]
      });

      return this.web3.utils.fromWei(gas.toString(), 'gwei');
    } catch (error) {
      console.error('Error estimating gas:', error);
      throw error;
    }
  }

  async getContractEvents(contractAddress, eventName, fromBlock) {
    const contract = new this.web3.eth.Contract(contractTemplates.Airdrop.abi, contractAddress);

    try {
      const events = await contract.getPastEvents(eventName, {
        fromBlock: fromBlock,
        toBlock: 'latest'
      });

      return events.map(event => ({
        ...event.returnValues,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      }));
    } catch (error) {
      console.error('Error getting contract events:', error);
      throw error;
    }
  }

  setRpcUrl(chain) {
    switch (chain) {
      case 'ethereum':
        this.web3.setProvider(process.env.ETHEREUM_RPC_URL);
        break;
      case 'binance':
        this.web3.setProvider(process.env.BINANCE_RPC_URL);
        break;
      case 'polygon':
        this.web3.setProvider(process.env.POLYGON_RPC_URL);
        break;
      default:
        throw new Error('Unsupported blockchain');
    }
  }

  async recordAgentCreation(walletAddress, ipfsHash) {
    // 这里实现将 Agent 创建信息记录到区块链的逻辑
    console.log(`Recording agent creation for wallet ${walletAddress} with IPFS hash ${ipfsHash}`);
    // 实际实现可能需要调用特定的智能合约方法
  }
}

module.exports = new BlockchainService();
