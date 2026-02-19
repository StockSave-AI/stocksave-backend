const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/savings/history/{userId}:
 *   get:
 *     summary: Get full deposit history for a user
 *     description: Customers can only see their own history. Owners can see any user's history.
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Array of transaction objects
 *       403:
 *         description: Unauthorized to view this user's history
 */

/**
 * @swagger
 * /api/savings/recent:
 *   get:
 *     summary: Get the 5 most recent deposits
 *     description: Returns the latest 5 transactions. Owners see system-wide; Customers see their own.
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of the 5 most recent transactions
 */

/**
 * @swagger
 * /api/savings/verify:
 *   get:
 *     summary: Verify a Paystack transaction
 *     description: Confirms payment status with Paystack and updates user balance.
 *     tags: [Savings]
 *     parameters:
 *       - in: query
 *         name: reference
 *         required: true
 *         description: The Paystack transaction reference
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment successfully verified and credited
 *       400:
 *         description: Invalid reference or payment failed
 */

router.post('/deposit', authenticate, authorize(['Customer']), savingsController.addSavings);
router.get('/history/:userId', authenticate, savingsController.getSavingsHistory);
router.get('/recent', authenticate, savingsController.getRecentDeposits);
router.get('/verify', savingsController.verifyPaystackPayment);
router.patch('/update-status', authenticate, authorize(['Owner']), savingsController.updateDepositStatus);

module.exports = router;


