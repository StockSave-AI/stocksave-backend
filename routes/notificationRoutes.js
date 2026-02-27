const express = require('express');
const router  = express.Router();
const n = require('../controllers/notificationsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Owner notification feed, system alerts, withdrawals and reconciliation
 */

router.use(authenticate, authorize(['Owner']));

// ─── STATIC ROUTES FIRST (must be before /:id) ───────────────────────────────

/**
 * @swagger
 * /api/notifications/summary:
 *   get:
 *     summary: All badge counts in one call
 *     description: Returns counts for all tabs — pending payments, low stock, fully booked, new signups, withdrawal alerts and unread bell badge.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tab counts and unread badge
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 low_stock_alerts: 2
 *                 fully_booked_products: 1
 *                 pending_payments: 26
 *                 new_signups: 8
 *                 withdrawal_alerts: 3
 *                 unread_notifications: 5
 *                 total_alerts: 40
 */
router.get('/summary', n.getAlertSummary);

/**
 * @swagger
 * /api/notifications/feed:
 *   get:
 *     summary: Owner personal notification feed
 *     description: >
 *       Returns stored notifications for the owner (deposit confirmations, withdrawal alerts, booking updates).
 *       Filter by type using ?type=withdrawal_alert|deposit_confirmed|booking_update|general.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [withdrawal_alert, deposit_confirmed, booking_update, stock_alert, general] }, description: Filter by notification type }
 *       - { in: query, name: page,  schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Paginated feed with stats.unread, stats.this_week, stats.total
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               stats:
 *                 unread: 5
 *                 this_week: 12
 *                 total: 34
 *               pagination:
 *                 page: 1
 *                 limit: 20
 *                 total: 34
 *                 total_pages: 2
 *               data:
 *                 - id: 10
 *                   type: withdrawal_alert
 *                   title: New Withdrawal Request
 *                   message: "John Gabriel withdrew ₦5,000. Reference: WDR-abc123."
 *                   is_read: 0
 *                   reference_id: 5
 *                   reference_type: user
 *                   created_at: "2026-02-26T10:00:00.000Z"
 */
router.get('/feed', n.getOwnerFeed);

/**
 * @swagger
 * /api/notifications/withdrawals:
 *   get:
 *     summary: All withdrawal notifications (unread)
 *     description: Shortcut to get only withdrawal_alert notifications for the owner. Same as GET /feed?type=withdrawal_alert but filtered to unread only by default.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: page,  schema: { type: integer, default: 1 } }
 *     responses:
 *       200:
 *         description: Withdrawal notifications list
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               stats:
 *                 unread: 3
 *                 this_week: 5
 *                 total: 3
 *               data:
 *                 - id: 10
 *                   type: withdrawal_alert
 *                   title: New Withdrawal Request
 *                   message: "John Gabriel withdrew ₦5,000. Reference: WDR-abc123."
 *                   is_read: 0
 *                   reference_id: 5
 *                   reference_type: user
 *                   created_at: "2026-02-26T10:00:00.000Z"
 */
router.get('/withdrawals', n.getWithdrawalAlerts);

/**
 * @swagger
 * /api/notifications/new-users:
 *   get:
 *     summary: Customers who signed up recently (New Signups tab)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: days,  schema: { type: integer, default: 7 },  description: How many days back to look }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: New customers with signup time
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               period: Last 7 days
 *               count: 8
 *               data:
 *                 - id: 12
 *                   first_name: Bayo
 *                   last_name: Ayinde
 *                   email: bayo@test.com
 *                   phone: "+2348098765432"
 *                   status: Active
 *                   balance: 0
 *                   hours_since_signup: 1
 */
router.get('/new-users', n.getNewUsers);

/**
 * @swagger
 * /api/notifications/pending-payments:
 *   get:
 *     summary: All pending transactions (Pending Payments tab)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending transactions with customer contact details and hours_pending
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               count: 26
 *               data:
 *                 - transaction_id: 12
 *                   first_name: Tolu
 *                   last_name: Akinyanju
 *                   amount: 5000
 *                   method: Cash
 *                   hours_pending: 3
 */
router.get('/pending-payments', n.getPendingPayments);

/**
 * @swagger
 * /api/notifications/low-stock:
 *   get:
 *     summary: Products below stock threshold (Low Stock tab)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: threshold, schema: { type: integer, default: 10 }, description: Alert when stock falls below this number }
 *     responses:
 *       200:
 *         description: Low stock product variants
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               threshold: 10
 *               alert_count: 2
 *               data:
 *                 - product_name: Beans
 *                   size_label: 50kg
 *                   total_stock: 3
 */
router.get('/low-stock', n.getLowStockAlerts);

/**
 * @swagger
 * /api/notifications/fully-booked:
 *   get:
 *     summary: Products with zero remaining stock (Fully Booked tab)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fully booked product variants
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               count: 1
 *               message: 1 product(s) fully booked
 *               data:
 *                 - product_name: Garri
 *                   size_label: 50kg
 *                   total_stock: 0
 *                   total_ever_added: 50
 */
router.get('/fully-booked', n.getFullyBookedAlerts);

/**
 * @swagger
 * /api/notifications/reconciliation:
 *   get:
 *     summary: Financial reconciliation — deposits vs withdrawals vs booking holds
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Financial summary with is_balanced flag
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 total_deposits: 250000
 *                 total_withdrawals: 50000
 *                 total_booking_holds: 75000
 *                 net_balance: 125000
 *                 is_balanced: true
 */
router.get('/reconciliation', n.getReconciliation);

/**
 * @swagger
 * /api/notifications/mark-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns count of updated rows
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: All notifications marked as read
 *               updated: 5
 */
router.patch('/mark-all', n.markAllAsRead);

/**
 * @swagger
 * /api/notifications/clear-all:
 *   delete:
 *     summary: Delete all notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns count of deleted rows
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: All notifications cleared
 *               deleted: 34
 */
router.delete('/clear-all', n.clearAll);

// ─── DYNAMIC ROUTES LAST (:id will match anything) ───────────────────────────

/**
 * @swagger
 * /api/notifications/stock-match/{variantId}:
 *   get:
 *     summary: Available FIFO stock batches for a product variant
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: variantId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: FIFO batches ordered oldest first
 */
router.get('/stock-match/:variantId', n.matchStockToBooking);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', n.markOneAsRead);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a single notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 */
router.delete('/:id', n.clearOne);

module.exports = router;