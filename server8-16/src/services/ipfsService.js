const IPFS = require('ipfs-http-client');

const ipfs = IPFS.create({
  host: 'ipfs.infura.io',
  port: 5001,
  protocol: 'https'
});

exports.addToIPFS = async (content) => {
  try {
    const result = await ipfs.add(JSON.stringify(content));
    return result.path;
  } catch (error) {
    console.error('Error adding to IPFS:', error);
    throw error;
  }
};

exports.getFromIPFS = async (cid) => {
  try {
    const stream = ipfs.cat(cid);
    let data = '';
    for await (const chunk of stream) {
      data += chunk.toString();
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting from IPFS:', error);
    throw error;
  }
};
