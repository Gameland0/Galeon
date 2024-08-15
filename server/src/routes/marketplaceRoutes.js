const express = require('express');
const router = express.Router();
const marketplaceController = require('../controllers/marketplaceController');

router.get('/agents', marketplaceController.getMarketplaceAgents);

module.exports = router;

