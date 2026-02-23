const express = require('express');
const router = express.Router();
const savings = require('../controllers/savingsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Savings
 *   description: Deposits, withdrawals and Paystack integrations
 */
/**
 * @swagger
 * /api/savings/webhook:
 *   post:
 *     summary: Paystack webhook (no auth - Paystack calls this)
 *     tags: [Savings]
 *     responses:
 *       200:
 *         description: Received
 */
router.post('/webhook', savings.handlePaystackWebhook);

/**
 * @swagger
 * /api/savings/verify:
 *   get:
 *     summary: Verify Paystack payment and credit balance
 *     tags: [Savings]
 *     parameters:
 *       - in: query
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           example: STK-1712345678
 *     responses:
 *       200:
 *         description: Payment verified, balance updated
 *       400:
 *         description: Payment failed or invalid reference
 */
router.get('/verify', savings.verifyPaystackPayment);

router.use(authenticate);

// ─── OWNER ONLY ────
/**
 * @swagger
 * /api/savings/update-status:
 *   patch:
 *     summary: Manually approve or reject a transaction (Owner only)
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transactionId, status]
 *             properties:
 *               transactionId:
 *                 type: integer
 *                 example: 12
 *               status:
 *                 type: string
 *                 enum: [Completed, Failed, Pending]
 *                 example: Completed
 *     responses:
 *       200:
 *         description: Status updated. If Completed, balance is credited automatically.
 *       403:
 *         description: Owners only
 */
router.patch('/update-status', authorize(['Owner']), savings.updateDepositStatus);

router.use(authorize(['Customer']));

/**
 * @swagger
 * /api/savings/deposit:
 *   post:
 *     summary: Initiate a deposit
 *     description: >
 *       Paystack returns payment_url - open in browser to pay.
 *       Cash and Transfer create a Pending transaction for owner approval.
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, method]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 5000
 *               method:
 *                 type: string
 *                 enum: [Cash, Paystack, Transfer]
 *               reference:
 *                 type: string
 *                 description: Optional custom reference
 *                 example: RCPT-001
 *     responses:
 *       200:
 *         description: Paystack - returns payment_url and reference
 *       201:
 *         description: Cash/Transfer - recorded as Pending
 *       400:
 *         description: Invalid amount or method
 */
router.post('/deposit', savings.addSavings);

/**
 * @swagger
 * /api/savings/history:
 *   get:
 *     summary: Get full transaction history
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All transactions sorted by most recent
 */
router.get('/history', savings.getSavingsHistory);

/**
 * @swagger
 * /api/savings/recent:
 *   get:
 *     summary: Get last 5 transactions
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Last 5 transactions
 */
router.get('/recent', savings.getRecentDeposits);

/**
 * @swagger
 * /api/savings/redeem:
 *   get:
 *     summary: Load redeem screen - balance and recent withdrawals
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns available_balance and last 5 withdrawals
 */
router.get('/redeem', savings.getRedeemScreen);

/**
 * @swagger
 * /api/savings/banks:
 *   get:
 *     summary: Get Nigerian bank list from Paystack
 *     description: Returns name and code for each bank. Use code in /withdraw.
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of { name, code } objects
 */
router.get('/banks', savings.getBankList);

/**
 * @swagger
 * /api/savings/withdraw:
 *   post:
 *     summary: Withdraw savings via Paystack Transfer
 *     description: Deducts balance immediately. Funds arrive in 2-5 business days.
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, account_name, account_number, bank_code]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 5000
 *               account_name:
 *                 type: string
 *                 example: Tolu Akinyanju
 *               account_number:
 *                 type: string
 *                 example: "0123456789"
 *               bank_code:
 *                 type: string
 *                 description: From GET /api/savings/banks
 *                 example: "044"
 *     responses:
 *       200:
 *         description: Withdrawal submitted, returns transfer_reference and new_balance
 *       400:
 *         description: Insufficient balance or missing fields
 */
router.post('/withdraw', savings.submitWithdrawal);

/**
 * @swagger
 * /api/savings/balance:
 *   get:
 *     summary: Get user balance
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 balance: { type: number, example: 5000.00 }
 *       401:
 *         description: Unauthorized
 */
router.get('/balance', savings.getBalance);

module.exports = router;
