const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/OwnerdashController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Owner Dashboard
 *   description: Administrative operations — all routes require Owner account type
 */

router.use(authenticate, authorize(['Owner']));

/**
 * @swagger
 * /api/owner/stats:
 *   get:
 *     summary: Platform overview — total users, deposits, withdrawals, bookings
 *     tags: [Owner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 total_users: 142
 *                 active_users: 130
 *                 total_deposits: 4500000
 *                 total_withdrawals: 800000
 *                 pending_transactions: 12
 *                 total_bookings: 87
 */
router.get('/stats', ownerController.getDashboardStats);

/**
 * @swagger
 * /api/owner/users:
 *   get:
 *     summary: Get ALL customers with pagination, search and optional transactions
 *     description: >
 *       Returns every customer in the system. Use this to find the correct userId
 *       before recording or approving a cash deposit.
 *       The user IDs returned here match exactly what /api/owner/recent-cash returns
 *       as user_id so you can safely cross-reference them.
 *
 *       Pagination — default page=1, limit=20. Use total_pages to loop through all customers.
 *
 *       Transactions — add ?include_transactions=true to get each customer's full
 *       transaction history nested inside their user object. Omit for faster list views.
 *
 *       Search — ?q=tolu matches first_name, last_name, email and phone simultaneously.
 *     tags: [Owner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by name, email or phone
 *         example: tolu
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Deactivated, Suspended]
 *         description: Filter by account status
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: Results per page
 *       - in: query
 *         name: include_transactions
 *         schema: { type: boolean, default: false }
 *         description: Set true to embed each user's transactions in the response
 *     responses:
 *       200:
 *         description: Paginated customer list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 85 }
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total_pages: { type: integer, example: 5 }
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer, example: 5 }
 *                       first_name: { type: string, example: Tolu }
 *                       last_name: { type: string, example: Akinyanju }
 *                       email: { type: string, example: tolu@test.com }
 *                       phone: { type: string, example: "+2348012345678" }
 *                       status: { type: string, example: Active }
 *                       balance: { type: number, example: 25000 }
 *                       created_at: { type: string, format: date-time }
 *                       transactions:
 *                         type: array
 *                         description: Only present when include_transactions=true
 *                         items:
 *                           type: object
 *                           properties:
 *                             id: { type: integer }
 *                             amount: { type: number }
 *                             type: { type: string }
 *                             method: { type: string }
 *                             status: { type: string }
 *                             reference: { type: string }
 *                             created_at: { type: string, format: date-time }
 */
router.get('/users', ownerController.getAllUsers);

/**
 * @swagger
 * /api/owner/users/{id}:
 *   get:
 *     summary: Get one customer with full transaction and booking history
 *     description: >
 *       Deep profile for a single customer. Use after selecting a user from GET /api/owner/users.
 *       Returns every transaction and every food booking for that customer.
 *     tags: [Owner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The customer's user ID
 *         schema: { type: integer, example: 5 }
 *     responses:
 *       200:
 *         description: Customer profile with transactions and bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer, example: 5 }
 *                     first_name: { type: string, example: Tolu }
 *                     last_name: { type: string, example: Akinyanju }
 *                     email: { type: string, example: tolu@test.com }
 *                     phone: { type: string }
 *                     balance: { type: number, example: 25000 }
 *                     status: { type: string, example: Active }
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           amount: { type: number }
 *                           type: { type: string }
 *                           method: { type: string }
 *                           status: { type: string }
 *                           reference: { type: string }
 *                           created_at: { type: string }
 *                     bookings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           product_name: { type: string }
 *                           size_label: { type: string }
 *                           slots_booked: { type: integer }
 *                           total_cost: { type: number }
 *                           created_at: { type: string }
 *       404:
 *         description: Customer not found
 */
router.get('/users/:id', ownerController.getUserById);

/**
 * @swagger
 * /api/owner/search-users:
 *   get:
 *     summary: Quick search users by name, email or phone
 *     description: Lightweight search. For full list with pagination use GET /api/owner/users instead.
 *     tags: [Owner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string, example: tolu }
 *         description: Matches first_name, last_name, email or phone
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Deactivated, Suspended] }
 *       - in: query
 *         name: account_type
 *         schema: { type: string, enum: [Customer, Owner] }
 *     responses:
 *       200:
 *         description: Matching users
 */
router.get('/search-users', ownerController.searchUsers);

// ─────────────────────────────────────────────────────────
// CASH DEPOSITS
// ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/owner/recent-cash:
 *   get:
 *     summary: Get pending cash deposits needing approval
 *     description: >
 *       Returns cash transactions awaiting owner approval.
 *       The user_id field in each record matches the id field in GET /api/owner/users
 *       so you can reliably cross-reference customer identity before approving.
 *     tags: [Owner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Pending, Completed, Failed], default: Pending }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Cash deposit list with customer identifiers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer, description: transaction ID used in update-status }
 *                       user_id: { type: integer, description: matches id in GET /api/owner/users }
 *                       first_name: { type: string }
 *                       last_name: { type: string }
 *                       phone: { type: string }
 *                       amount: { type: number }
 *                       status: { type: string }
 *                       reference: { type: string }
 *                       created_at: { type: string, format: date-time }
 */
router.get('/recent-cash', ownerController.getRecentCashDeposits);

/**
 * @swagger
 * /api/owner/record-deposit:
 *   post:
 *     summary: Manually record a cash deposit for a customer
 *     description: >
 *       Creates a Pending cash transaction for a customer.
 *       Use GET /api/owner/users to find the correct userId first.
 *       After recording, call PATCH /api/savings/update-status with the
 *       returned transaction_id to approve and credit the customer's balance.
 *     tags: [Owner Dashboard]
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
 *         description: Deposit recorded
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Cash deposit recorded
 *               data:
 *                 transaction_id: 12
 *                 amount: 5000
 *                 status: Pending
 *       404:
 *         description: Customer not found
 */
router.post('/record-deposit', ownerController.recordCashDeposit);

// ─────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/owner/transactions:
 *   get:
 *     summary: Get all transactions across all customers
 *     description: Filter by type, status and method. Defaults to 50 most recent.
 *     tags: [Owner Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [Deposit, Withdrawal, Booking_Hold] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Pending, Completed, Failed] }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [Cash, Paystack, Transfer] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Transaction list with customer details
 */
router.get('/transactions', ownerController.getAllTransactions);

module.exports = router;