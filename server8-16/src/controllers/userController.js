const userModel = require('../models/User');
const { generateToken } = require('../services/securityService');

exports.loginWithWallet = async (req, res) => {
  const { address, chainId } = req.body;
  try {
    let user = await userModel.findByAddress(address);
    if (!user) {
      user = await userModel.create(address, chainId);
    } else {
      await userModel.updateChainId(user.id, chainId);
    }
    const token = generateToken(user.id);
    res.json({ token, userId: user.id });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};
