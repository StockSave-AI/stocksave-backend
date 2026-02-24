const express = require('express');
const router = express.Router();
const o = require('../controllers/OwnerdashController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Owner
 *   description: Owner-only admin routes
 */

router.use(authenticate, authorize(['Owner']));

/**
 * @swagger
 * /api/owner/stats:
 *   get:
 *     summary: Platform overview stats
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: total_users, active_users, total_deposits, total_withdrawals, pending_transactions, total_bookings
 */
router.get('/stats', o.getDashboardStats);

/**
 * @swagger
 * /api/owner/users:
 *   get:
 *     summary: All customers with pagination, search and optional transactions
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: q, schema: { type: string }, description: Search name/email/phone }
 *       - { in: query, name: status, schema: { type: string, enum: [Active, Deactivated, Suspended] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: include_transactions, schema: { type: boolean }, description: Embed transactions per user }
 *     responses:
 *       200:
 *         description: Paginated customer list. user.id matches user_id in /recent-cash
 */
router.get('/users', o.getAllUsers);

/**
 * @swagger
 * /api/owner/users/{id}:
 *   get:
 *     summary: Single customer with full transaction and booking history
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Customer profile with transactions and bookings
 *       404:
 *         description: Customer not found
 */
router.get('/users/:id', o.getUserById);

/**
 * @swagger
 * /api/owner/search-users:
 *   get:
 *     summary: Quick user search by name, email or phone
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: q, schema: { type: string }, example: tolu }
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: account_type, schema: { type: string, enum: [Customer, Owner] } }
 *     responses:
 *       200:
 *         description: Matching users
 */
router.get('/search-users', o.searchUsers);

/**
 * @swagger
 * /api/owner/recent-cash:
 *   get:
 *     summary: Pending cash deposits needing approval
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, default: Pending } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Cash transactions with customer name and user_id
 */
router.get('/recent-cash', o.getRecentCashDeposits);

/**
 * @swagger
 * /api/owner/record-deposit:
 *   post:
 *     summary: Record a cash deposit for a customer
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, amount]
 *             properties:
 *               userId: { type: integer, example: 5 }
 *               amount: { type: number, example: 5000 }
 *               reference: { type: string, example: RCPT-001 }
 *     responses:
 *       201:
 *         description: Returns transaction_id - use in PATCH /api/savings/update-status to approve
 *       404:
 *         description: Customer not found
 */
router.post('/record-deposit', o.recordCashDeposit);

/**
 * @swagger
 * /api/owner/withdrawals:
 *   get:
 *     summary: Withdrawals pending bank confirmation
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, default: Processing } }
 *     responses:
 *       200:
 *         description: Withdrawals with customer details and reference
 */
router.get('/withdrawals', o.getPendingWithdrawals);

/**
 * @swagger
 * /api/owner/complete-withdrawal:
 *   patch:
 *     summary: Mark a withdrawal as completed after bank confirmation
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transactionId]
 *             properties:
 *               transactionId: { type: integer, example: 44 }
 *     responses:
 *       200:
 *         description: Withdrawal marked completed
 *       404:
 *         description: Not found or already completed
 */
router.patch('/complete-withdrawal', o.completeWithdrawal);

/**
 * @swagger
 * /api/owner/transactions:
 *   get:
 *     summary: All transactions across all customers
 *     tags: [Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [Deposit, Withdrawal, Booking_Hold] } }
 *       - { in: query, name: status, schema: { type: string, enum: [Pending, Completed, Failed, Processing] } }
 *       - { in: query, name: method, schema: { type: string, enum: [Cash, Paystack, Transfer] } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: Transaction list with customer details
 */
router.get('/transactions', o.getAllTransactions);

module.exports = router;