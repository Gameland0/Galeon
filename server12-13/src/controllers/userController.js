const jwt = require('jsonwebtoken');
const Web3 = require('web3');
const DatabaseService = require('../services/databaseService');
const UUID = require('uuid');

const web3 = new Web3();

exports.connectWallet = async (req, res) => {
  const { address, chainId, message, signature } = req.body;

  try {
    const recoveredAddress = web3.eth.accounts.recover(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const token = jwt.sign({ id: address }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const info = await DatabaseService.query('SELECT * FROM user_info WHERE userid = ?', [address]);
    if (!info.length) {
      const id = UUID.v4();
      DatabaseService.query(
        'INSERT INTO user_info (id, userid, teammax) VALUES (?, ?, ?)',
        [id, address, 1]
      );
    }
    res.json({ token, address, chainId });
  } catch (error) {
    console.error('Error connecting wallet:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
};