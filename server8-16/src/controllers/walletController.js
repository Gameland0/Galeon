const web3 = require('../config/blockchain');
const db = require('../config/database');

exports.getBalance = async (req, res) => {
  const { address } = req.params;
  
  try {
    const balance = await web3.eth.getBalance(address);
    res.json({ balance: web3.utils.fromWei(balance, 'ether') });
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch balance' });
  }
};

exports.updateWallet = (req, res) => {
  const { userId, newAddress } = req.body;
  
  db.query('UPDATE users SET wallet_address = ? WHERE id = ?', 
    [newAddress, userId], 
    (error) => {
      if (error) {
        return res.status(500).json({ error: 'Could not update wallet address' });
      }
      res.json({ message: 'Wallet address updated' });
    }
  );
};
