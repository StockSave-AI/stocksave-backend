const express = require('express');
const router = express.Router();
const payoutController = require('../controllers/payoutController');

router.post('/withdraw', payoutController.requestWithdrawal); // Verified Bank Transfer

module.exports = router;
