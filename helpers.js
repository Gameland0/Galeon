exports.generateRandomString = (length) => {
    return crypto.randomBytes(length).toString('hex');
  };
  
  exports.formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  exports.calculateGasPrice = async (web3) => {
    const gasPrice = await web3.eth.getGasPrice();
    return web3.utils.fromWei(gasPrice, 'gwei');
  };
  