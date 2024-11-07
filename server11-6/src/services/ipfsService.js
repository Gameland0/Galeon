const axios = require('axios');
const FormData = require('form-data');

const IPFS_API_URL = 'https://ipfs.infura.io:5001/api/v0';
const INFURA_PROJECT_ID = '002508d44ea34eb6924c20e90b84a302';
const INFURA_PROJECT_SECRET = '134e00a4bb354266899891aea32a6dee';

// 创建认证字符串
const auth = 'Basic ' + Buffer.from(INFURA_PROJECT_ID + ':' + INFURA_PROJECT_SECRET).toString('base64');

exports.addToIPFS = async (content) => {
  try {
    // 确保content是字符串
    if (typeof content !== 'string') {
      content = JSON.stringify(content);
    }

    const formData = new FormData();
    formData.append('file', Buffer.from(content));

    const response = await axios.post(`${IPFS_API_URL}/add`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': auth,
        'Content-Type': 'multipart/form-data'
      }
    });

    console.log('IPFS upload response:', response.data);
    return response.data.Hash;
  } catch (error) {
    console.error('Error adding to IPFS:', error.response ? error.response.data : error.message);
    throw error;
  }
};

exports.getFromIPFS = async (cid) => {
  try {
    const response = await axios({
      method: 'post',
      url: `${IPFS_API_URL}/cat`,
      params: { arg: cid },
      headers: {
        'Authorization': auth
      },
      responseType: 'arraybuffer'
    });
    
    // Convert the ArrayBuffer to a string
    const content = Buffer.from(response.data).toString('utf8');
    
    try {
      // Attempt to parse the content as JSON
      return JSON.parse(content);
    } catch (parseError) {
      // If parsing fails, return the content as is
      return content;
    }
  } catch (error) {
    console.error('Error getting from IPFS:', error.response ? error.response.data : error.message);
    throw new Error(`Failed to get content from IPFS: ${error.message}`);
  }
};
