const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/', creditController.getUserCredit);
router.post('/use', creditController.useCredit);

module.exports = router;
