const Web3 = require('web3');
const contractTemplates = require('../contractTemplates');

// 初始化Web3实例
const web3 = new Web3(process.env.ETHEREUM_RPC_URL);

// 部署合约
exports.deployContract = async (contractName, args) => {
  const contractTemplate = contractTemplates[contractName];
  if (!contractTemplate) {
    throw new Error('Contract template not found');
  }

  const contract = new web3.eth.Contract(contractTemplate.abi);
  const accounts = await web3.eth.getAccounts();
  
  const deployOptions = {
    data: contractTemplate.bytecode,
    arguments: args
  };

  try {
    const deployedContract = await contract.deploy(deployOptions).send({
      from: accounts[0],
      gas: 1500000,
      gasPrice: '30000000000'
    });

    const transaction = await web3.eth.getTransaction(deployedContract.transactionHash);

    return {
      address: deployedContract.options.address,
      transactionHash: deployedContract.transactionHash,
      blockNumber: transaction.blockNumber
    };
  } catch (error) {
    console.error('Error deploying contract:', error);
    throw error;
  }
};

// 发送代币
exports.sendToken = async (contractAddress, recipient, amount) => {
  const tokenABI = [
    {
      "constant": false,
      "inputs": [
        {
          "name": "_to",
          "type": "address"
        },
        {
          "name": "_value",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "type": "function"
    }
  ];

  const contract = new web3.eth.Contract(tokenABI, contractAddress);
  const accounts = await web3.eth.getAccounts();

  try {
    const result = await contract.methods.transfer(recipient, web3.utils.toWei(amount, 'ether')).send({
      from: accounts[0]
    });

    return {
      transactionHash: result.transactionHash
    };
  } catch (error) {
    console.error('Error sending token:', error);
    throw error;
  }
};

// 估算合约部署的gas
exports.estimateGas = async (contractName, args) => {
  const contractTemplate = contractTemplates[contractName];
  if (!contractTemplate) {
    throw new Error('Contract template not found');
  }

  const contract = new web3.eth.Contract(contractTemplate.abi);
  
  const deployOptions = {
    data: contractTemplate.bytecode,
    arguments: args
  };

  try {
    const gas = await contract.deploy(deployOptions).estimateGas();
    return web3.utils.fromWei(gas.toString(), 'gwei');
  } catch (error) {
    console.error('Error estimating gas for contract deployment:', error);
    throw error;
  }
};

// 估算代币转账的gas
exports.estimateTokenTransferGas = async (contractAddress, recipient, amount) => {
  const tokenABI = [
    {
      "constant": false,
      "inputs": [
        {
          "name": "_to",
          "type": "address"
        },
        {
          "name": "_value",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "type": "function"
    }
  ];

  const contract = new web3.eth.Contract(tokenABI, contractAddress);
  const accounts = await web3.eth.getAccounts();

  try {
    const gas = await contract.methods.transfer(recipient, web3.utils.toWei(amount, 'ether')).estimateGas({
      from: accounts[0]
    });

    return web3.utils.fromWei(gas.toString(), 'gwei');
  } catch (error) {
    console.error('Error estimating gas for token transfer:', error);
    throw error;
  }
};

// 获取合约事件
exports.getContractEvents = async (contractAddress, eventName, fromBlock = 0) => {
  const contractABI = [
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    }
  ];

  const contract = new web3.eth.Contract(contractABI, contractAddress);

  try {
    const events = await contract.getPastEvents(eventName, {
      fromBlock: fromBlock,
      toBlock: 'latest'
    });

    return events.map(event => ({
      from: event.returnValues.from,
      to: event.returnValues.to,
      value: web3.utils.fromWei(event.returnValues.value, 'ether'),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash
    }));
  } catch (error) {
    console.error('Error getting contract events:', error);
    throw error;
  }
};

// 获取账户余额
exports.getAccountBalance = async (address) => {
  try {
    const balance = await web3.eth.getBalance(address);
    return web3.utils.fromWei(balance, 'ether');
  } catch (error) {
    console.error('Error getting account balance:', error);
    throw error;
  }
};

// 监听合约事件
exports.subscribeToContractEvents = (contractAddress, eventName, callback) => {
  const contractABI = [
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    }
  ];

  const contract = new web3.eth.Contract(contractABI, contractAddress);

  const subscription = contract.events[eventName]({}, (error, event) => {
    if (error) {
      console.error('Error on event subscription:', error);
      return;
    }
    callback({
      from: event.returnValues.from,
      to: event.returnValues.to,
      value: web3.utils.fromWei(event.returnValues.value, 'ether'),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash
    });
  });

  return subscription;
};
