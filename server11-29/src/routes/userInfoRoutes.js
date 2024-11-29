const express = require('express');
const router = express.Router();
const userController = require('../controllers/userInfoController');

router.get('/', userController.getUserInfo);
router.put('/updata', userController.updataTeammax)

module.exports = router;