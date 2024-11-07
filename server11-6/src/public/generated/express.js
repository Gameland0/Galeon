require('dotenv').config();
const express = require('express');
const Web3 = require('web3');
const rateLimit = require('express-rate-limit');
const contractABI = require('./GameAssetsABI.json'); // ABI from compiled contract

const contractAddress = process.env.CONTRACT_ADDRESS; // Deployed contract address from environment variable
const infuraProjectId = process.env.INFURA_PROJECT_ID; // Infura project ID from environment variable

const app = express();
const port = process.env.PORT || 3000;

// Connect to Ethereum node
const web3 = new Web3(`https://mainnet.infura.io/v3/${infuraProjectId}`);
const gameAssetsContract = new web3.eth.Contract(contractABI, contractAddress);

// Middleware to parse JSON requests
app.use(express.json());

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// API endpoint to get asset details
app.get('/asset/:id', async (req, res) => {
    try {
        const assetId = req.params.id;
        const asset = await gameAssetsContract.methods.assets(assetId).call();
        res.json(asset);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

// API endpoint to create a new asset
app.post('/asset', async (req, res) => {
    const { name } = req.body;
    // Assume the client handles signing transactions and sends the signed transaction data
    const signedTx = req.body.signedTransactionData;

    try {
        const receipt = await web3.eth.sendSignedTransaction(signedTx);
        res.json(receipt);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
