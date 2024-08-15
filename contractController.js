const { deployContract, sendToken, estimateGas, estimateTokenTransferGas } = require('../services/blockchainService');

exports.deployContract = async (req, res) => {
  const { contractName, args } = req.body;
  try {
    const result = await deployContract(contractName, args);
    res.json({
      address: result.address,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber
    });
  } catch (error) {
    res.status(500).json({ error: 'Error deploying contract' });
  }
};

exports.sendToken = async (req, res) => {
  const { contractAddress, recipient, amount } = req.body;
  try {
    const result = await sendToken(contractAddress, recipient, amount);
    res.json({
      transactionHash: result.transactionHash
    });
  } catch (error) {
    res.status(500).json({ error: 'Error sending token' });
  }
};

exports.estimateGas = async (req, res) => {
  const { contractName, args } = req.body;
  try {
    const estimatedGas = await estimateGas(contractName, args);
    res.json({ estimatedGas });
  } catch (error) {
    res.status(500).json({ error: 'Error estimating gas' });
  }
};

exports.estimateTokenTransferGas = async (req, res) => {
  const { contractAddress, recipient, amount } = req.body;
  try {
    const estimatedGas = await estimateTokenTransferGas(contractAddress, recipient, amount);
    res.json({ estimatedGas });
  } catch (error) {
    res.status(500).json({ error: 'Error estimating token transfer gas' });
  }
};
