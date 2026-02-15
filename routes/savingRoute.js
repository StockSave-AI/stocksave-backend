const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const { authenticate } = require('../middleware/authMiddleware'); // Import this!

/**
 * @swagger
 * components:
 *   schemas:
 *     DepositRequest:
 *       type: object
 *       required: [user_id, amount, method, reference]
 *       properties:
 *         user_id: { type: integer, example: 1 }
 *         amount: { type: number, example: 500.50 }
 *         method: { type: string, enum: ['Cash', 'Paystack', 'Transfer'], example: "Transfer" }
 *         reference: { type: string, example: "REF-123456" }
 */

/**
 * @swagger
 * /api/savings/deposit:
 *   post:
 *     summary: Add savings to user account
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DepositRequest'
 *     responses:
 *       200:
 *         description: Savings updated successfully
 *       400:
 *         description: Missing fields or invalid data
 */

/**
 * @swagger
 * /api/savings/history/{userId}:
 *   get:
 *     summary: Get transaction history for a user
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
 *         description: List of transactions retrieved
 */


// Use authenticate to protect these routes
router.post('/deposit', authenticate, savingsController.addSavings); 
router.get('/history/:userId', authenticate, savingsController.getHistory); 

module.exports = router;
