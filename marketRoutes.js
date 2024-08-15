const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { verifyToken } = require('../middleware/auth');

router.post('/list', verifyToken, marketController.listAgent);
router.get('/listings', marketController.getListings);

module.exports = router;
