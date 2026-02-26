const express = require('express');
const router = express.Router();
const n = require('../controllers/customerNotificationController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Customer Notifications
 *   description: Customer notification feed, stock alerts and read state management
 */

router.use(authenticate, authorize(['Customer']));

/**
 * @swagger
 * /api/customer/notifications:
 *   get:
 *     summary: Get all notifications with unread count and stats
 *     tags: [Customer Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [payment_reminder, stock_alert, redemption_update, booking_update, deposit_confirmed, general] } }
 *       - { in: query, name: unread, schema: { type: boolean }, description: true to return only unread }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Notifications with stats (unread count, this_week, total)
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               stats:
 *                 unread: 3
 *                 this_week: 5
 *                 total: 12
 *               data:
 *                 - id: 1
 *                   type: deposit_confirmed
 *                   title: Deposit Confirmed
 *                   message: "Your deposit of ₦5,000 has been confirmed."
 *                   is_read: 0
 *                   reference_id: 44
 *                   reference_type: transaction
 *                   created_at: "2026-02-25T10:00:00.000Z"
 */
router.get('/', n.getNotifications);

/**
 * @swagger
 * /api/customer/notifications/stock-alerts:
 *   get:
 *     summary: Recent stock additions for Stock Alerts tab
 *     tags: [Customer Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: days, schema: { type: integer, default: 30 }, description: How many days back to look }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Recently added stock with product name, quantity, price and availability
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               count: 3
 *               data:
 *                 - product_name: Garri
 *                   size_label: 50kg
 *                   price: 25000
 *                   quantity_added: 100
 *                   quantity_remaining: 78
 *                   slots_remaining: 22
 *                   availability: open
 *                   created_at: "2026-02-24T09:00:00.000Z"
 */
router.get('/stock-alerts', n.getStockAlerts);

/**
 * @swagger
 * /api/customer/notifications/mark-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Customer Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked read. Returns count of updated rows.
 */
router.patch('/mark-all', n.markAllAsRead);

/**
 * @swagger
 * /api/customer/notifications/{id}:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Customer Notifications]
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
router.patch('/:id', n.markAsRead);

/**
 * @swagger
 * /api/customer/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Customer Notifications]
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
router.delete('/:id', n.deleteNotification);

module.exports = router;