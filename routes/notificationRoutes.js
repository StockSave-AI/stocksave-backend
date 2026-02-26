const express = require('express');
const router = express.Router();
const n = require('../controllers/notificationsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Stock alerts, payment reminders and reconciliation — Owner only
 */

router.use(authenticate, authorize(['Owner']));

/**
 * @swagger
 * /api/notifications/new-users:
 *   get:
 *     summary: See customers who signed up recently
 *     description: >
 *       Returns new customer accounts ordered by most recent signup.
 *       Default shows last 7 days. Adjust with ?days=N.
 *       hours_since_signup tells you exactly how long ago they joined.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 7 }
 *         description: How many days back to look. Default is 7.
 *         example: 7
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: Max number of users to return
 *     responses:
 *       200:
 *         description: New customers with signup time
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               period: Last 7 days
 *               count: 4
 *               data:
 *                 - id: 12
 *                   first_name: Amara
 *                   last_name: Okafor
 *                   email: amara@test.com
 *                   phone: "+2348098765432"
 *                   status: Active
 *                   balance: 0
 *                   created_at: "2026-02-22T10:30:00.000Z"
 *                   hours_since_signup: 14
 */
router.get('/new-users', n.getNewUsers);

/**
 * @swagger
 * /api/notifications/summary:
 *   get:
 *     summary: All alert badge counts in one call
 *     description: >
 *       Returns counts for low stock, fully booked products and pending payments.
 *       Use on the owner dashboard to show notification badge numbers without
 *       making 3 separate calls.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alert summary counts
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 low_stock_alerts: 2
 *                 fully_booked_products: 1
 *                 pending_payments: 5
 *                 new_signups_last_7_days: 4
 *                 total_alerts: 12
 */
router.get('/summary', n.getAlertSummary);

/**
 * @swagger
 * /api/notifications/low-stock:
 *   get:
 *     summary: Products with stock below threshold
 *     description: >
 *       Returns all product variants where total remaining stock across all FIFO batches
 *       is below the threshold. Default threshold is 10. Adjust with ?threshold=N.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: threshold
 *         schema: { type: integer, default: 10 }
 *         description: Alert when stock falls below this number
 *         example: 10
 *     responses:
 *       200:
 *         description: Low stock alerts
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               threshold: 10
 *               alert_count: 2
 *               data:
 *                 - product_variant_id: 2
 *                   product_name: Beans
 *                   size_label: 50kg
 *                   total_stock: 8
 *                 - product_variant_id: 5
 *                   product_name: Palm Oil
 *                   size_label: 5L
 *                   total_stock: 3
 */
router.get('/low-stock', n.getLowStockAlerts);

/**
 * @swagger
 * /api/notifications/pending-payments:
 *   get:
 *     summary: All pending transactions needing owner attention
 *     description: >
 *       Returns every transaction with status Pending including customer contact details.
 *       Use this to follow up on unpaid Cash or Transfer deposits.
 *       hours_pending shows how long the transaction has been sitting.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending transactions with customer details
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               count: 3
 *               data:
 *                 - transaction_id: 12
 *                   user_id: 5
 *                   first_name: Tolu
 *                   last_name: Akinyanju
 *                   email: tolu@test.com
 *                   phone: "+2348012345678"
 *                   amount: 5000
 *                   method: Cash
 *                   type: Deposit
 *                   reference: CASH-1712345678
 *                   hours_pending: 3
 */
router.get('/pending-payments', n.getPendingPayments);

/**
 * @swagger
 * /api/notifications/fully-booked:
 *   get:
 *     summary: Products with zero stock remaining (fully booked)
 *     description: >
 *       Returns all product variants where every FIFO batch has been fully consumed.
 *       Use to notify customers on a waitlist or prompt the owner to restock.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fully booked product list
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               count: 1
 *               message: 1 product(s) fully booked
 *               data:
 *                 - product_variant_id: 3
 *                   product_name: Garri
 *                   size_label: 50kg
 *                   price: 25000
 *                   total_stock: 0
 *                   total_ever_added: 50
 */
router.get('/fully-booked', n.getFullyBookedAlerts);

/**
 * @swagger
 * /api/notifications/stock-match/{variantId}:
 *   get:
 *     summary: View available stock batches for a product variant in FIFO order
 *     description: >
 *       Returns all stock_entries for a variant that still have stock remaining,
 *       ordered oldest first. Use to confirm which batch will be consumed next
 *       when a customer books.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         description: product_variants.id
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Available stock batches in FIFO order
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 variant_id: 1
 *                 total_available: 75
 *                 batches_available: 2
 *                 batches:
 *                   - stock_batch_id: 1
 *                     quantity_remaining: 50
 *                     date_added: "2026-01-01T00:00:00.000Z"
 *                     product_name: Rice
 *                     size_label: 50kg
 *                   - stock_batch_id: 3
 *                     quantity_remaining: 25
 *                     date_added: "2026-02-01T00:00:00.000Z"
 *                     product_name: Rice
 *                     size_label: 50kg
 */
router.get('/stock-match/:variantId', n.matchStockToBooking);

/**
 * @swagger
 * /api/notifications/reconciliation:
 *   get:
 *     summary: Financial reconciliation — deposits vs withdrawals vs booking holds
 *     description: >
 *       Compares total completed deposits against total withdrawals and booking holds.
 *       net_balance should always be >= 0. If negative something is wrong.
 *       is_balanced is false when net_balance is negative.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation summary
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 total_deposits: 250000
 *                 total_withdrawals: 50000
 *                 total_booking_holds: 75000
 *                 total_pending: 15000
 *                 net_balance: 125000
 *                 is_balanced: true
 */
router.get('/reconciliation', n.getReconciliation);

module.exports = router;