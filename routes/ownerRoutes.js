const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/OwnerdashController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// All routes below require Owner access
router.use(authenticate, authorize(['Owner']));

/**
 * @swagger
 * tags:
 *   name: Owner Dashboard
 *   description: Administrative operations for owners only
 */

/**
 * @swagger
 * /stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Owner Dashboard]
 *     responses:
 *       200:
 *         description: Returns statistics for the owner dashboard
 */
router.get('/stats', ownerController.getDashboardStats);


/**
 * @swagger
 * /search-users:
 *   get:
 *     summary: Search for users
 *     tags: [Owner Dashboard]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: The search query (e.g., name or email)
 *     responses:
 *       200:
 *         description: List of matching users
 */
router.get('/search-users', ownerController.searchUsers);
/**
 * @swagger
 * /recent-cash:
 *   get:
 *     summary: Get recent cash deposits
 *     tags: [Owner Dashboard]
 *     responses:
 *       200:
 *         description: List of recent cash deposit records
 */
router.get('/recent-cash', ownerController.getRecentCashDeposits);

/**
 * @swagger
 * /record-deposit:
 *   post:
 *     summary: Record a new cash deposit
 *     tags: [Owner Dashboard]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string }
 *               amount: { type: number }
 *     responses:
 *       201:
 *         description: Deposit recorded successfully
 *       401:
 *         description: Unauthorized - Owner access required
 */
router.post('/record-deposit', ownerController.recordCashDeposit);

module.exports = router;
