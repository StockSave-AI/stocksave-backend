const express = require('express');
const router  = express.Router();
const n = require('../controllers/notificationsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Owner notification feed, system alerts and reconciliation
 */

router.use(authenticate, authorize(['Owner']));

// ─── OWNER PERSONAL FEED ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/notifications/feed:
 *   get:
 *     summary: Owner personal notification feed with unread count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,  schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Paginated feed with stats.unread, stats.this_week, stats.total
 */
router.get('/feed', n.getOwnerFeed);

/**
 * @swagger
 * /api/notifications/mark-all:
 *   patch:
 *     summary: Mark all owner notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns count of updated rows
 */
router.patch('/mark-all', n.markAllAsRead);

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
 *         description: Notification marked read
 *       404:
 *         description: Not found
 */
router.patch('/:id/read', n.markOneAsRead);

/**
 * @swagger
 * /api/notifications/clear-all:
 *   delete:
 *     summary: Delete all owner notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications deleted. Returns count.
 */
router.delete('/clear-all', n.clearAll);

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
 *         description: Not found
 */
router.delete('/:id', n.clearOne);

// ─── LIVE SYSTEM ALERTS ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/notifications/summary:
 *   get:
 *     summary: All badge counts in one call — low stock + pending payments + unread feed
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: low_stock_alerts, pending_payments, new_signups, unread_notifications, total_alerts
 */
router.get('/summary', n.getAlertSummary);

/**
 * @swagger
 * /api/notifications/new-users:
 *   get:
 *     summary: Customers who signed up recently
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: days,  schema: { type: integer, default: 7 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 */
router.get('/new-users', n.getNewUsers);

/**
 * @swagger
 * /api/notifications/low-stock:
 *   get:
 *     summary: Products below stock threshold
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: threshold, schema: { type: integer, default: 10 } }
 */
router.get('/low-stock', n.getLowStockAlerts);

/**
 * @swagger
 * /api/notifications/pending-payments:
 *   get:
 *     summary: All pending transactions needing owner attention
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/pending-payments', n.getPendingPayments);

/**
 * @swagger
 * /api/notifications/fully-booked:
 *   get:
 *     summary: Products with zero remaining stock
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/fully-booked', n.getFullyBookedAlerts);

/**
 * @swagger
 * /api/notifications/stock-match/{variantId}:
 *   get:
 *     summary: Available FIFO batches for a product variant
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: variantId, required: true, schema: { type: integer } }
 */
router.get('/stock-match/:variantId', n.matchStockToBooking);

/**
 * @swagger
 * /api/notifications/reconciliation:
 *   get:
 *     summary: Financial reconciliation — deposits vs withdrawals vs booking holds
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/reconciliation', n.getReconciliation);

module.exports = router;