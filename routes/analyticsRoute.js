
const express = require('express');
const router = express.Router();
const a = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Financial analytics and business intelligence — Owner only
 */

router.use(authenticate, authorize(['Owner']));

/**
 * @swagger
 * /api/analytics/financial-summary:
 *   get:
 *     summary: All financial numbers in one call — connect to summary cards
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Revenue, withdrawals, net, this week, this month, pending
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 total_revenue: 2500000
 *                 total_withdrawals: 480000
 *                 net_balance: 2020000
 *                 total_held_in_accounts: 1850000
 *                 total_pending_deposits: 35000
 *                 total_booking_holds: 120000
 *                 this_week:
 *                   deposits: 180000
 *                   withdrawals: 25000
 *                   net: 155000
 *                 this_month:
 *                   deposits: 620000
 *                 active_customers_with_balance: 42
 */
router.get('/financial-summary', a.getFinancialSummary);

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Lightweight overview — for dashboard stat cards
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: total_revenue, total_withdrawals, net, customers, bookings, pending_transactions
 */
router.get('/overview', a.getOverview);

/**
 * @swagger
 * /api/analytics/monthly-trend:
 *   get:
 *     summary: Monthly deposits and withdrawals — last 12 months (for bar/line charts)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array ordered oldest→newest. Each item has month, month_label, deposits, withdrawals, counts.
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 - month: "2026-01"
 *                   month_label: "Jan 2026"
 *                   total_transactions: 88
 *                   deposits: 1200000
 *                   withdrawals: 180000
 *                   booking_holds: 95000
 *                   deposit_count: 61
 *                   withdrawal_count: 12
 */
router.get('/monthly-trend', a.getMonthlyTrend);

/**
 * @swagger
 * /api/analytics/weekly-trend:
 *   get:
 *     summary: Weekly deposits and withdrawals — last 8 weeks (for weekly chart)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array ordered oldest→newest. Each item has week_start label, deposits, withdrawals.
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 - year: 2026
 *                   week_number: 7
 *                   week_start: "09 Feb"
 *                   deposits: 320000
 *                   withdrawals: 45000
 *                   deposit_count: 18
 *                   withdrawal_count: 4
 */
router.get('/weekly-trend', a.getWeeklyTrend);

/**
 * @swagger
 * /api/analytics/stock-turnover:
 *   get:
 *     summary: Units sold and turnover rate per product variant
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Products ranked by units_sold with turnover_rate_percent
 */
router.get('/stock-turnover', a.getStockTurnover);

/**
 * @swagger
 * /api/analytics/most-demanded:
 *   get:
 *     summary: Top 10 most booked products
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Two lists — by booking count and by transaction holds
 */
router.get('/most-demanded', a.getMostDemanded);

/**
 * @swagger
 * /api/analytics/dispute-patterns:
 *   get:
 *     summary: Users with more than 2 failed transactions
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users with failed_transactions count and last_failure date
 */
router.get('/dispute-patterns', a.getDisputePatterns);

module.exports = router;