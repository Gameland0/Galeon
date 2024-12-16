const express = require('express');
const router = express.Router();
const ipfsService = require('../services/ipfsService');

router.post('/upload', async (req, res) => {
  try {
    const { content } = req.body;
    const ipfsHash = await ipfsService.addToIPFS(content);
    res.json({ ipfsHash });
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    res.status(500).json({ error: 'Failed to upload to IPFS' });
  }
});

module.exports = router;
