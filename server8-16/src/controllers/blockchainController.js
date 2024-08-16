const blockchainService = require('../services/blockchainService');

exports.deployContract = async (req, res) => {
  const { contractCode, chain } = req.body;
  try {
    const result = await blockchainService.deployContract(contractCode, chain);
    res.json(result);
  } catch (error) {
    console.error('Error deploying contract:', error);
    res.status(500).json({ error: 'Failed to deploy contract' });
  }
};

exports.estimateGas = async (req, res) => {
  const { contractCode, chain } = req.body;
  try {
    const estimatedGas = await blockchainService.estimateGas(contractCode, chain);
    res.json({ estimatedGas });
  } catch (error) {
    console.error('Error estimating gas:', error);
    res.status(500).json({ error: 'Failed to estimate gas' });
  }
};

exports.getContractEvents = async (req, res) => {
  const { contractAddress } = req.params;
  const { eventName, fromBlock } = req.query;
  try {
    const events = await blockchainService.getContractEvents(contractAddress, eventName, fromBlock);
    res.json(events);
  } catch (error) {
    console.error('Error getting contract events:', error);
    res.status(500).json({ error: 'Failed to get contract events' });
  }
};
