const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     UserSignup:
 *       type: object
 *       required: [first_name, last_name, email, phone, password, account_type]
 *       properties:
 *         first_name: { type: string, example: "Jane" }
 *         last_name: { type: string, example: "Doe" }
 *         email: { type: string, example: "john@example.com" }
 *         phone: { type: string, example: "+1234567890" }
 *         password: { type: string, example: "StrongPass123!" }
 *         account_type: { type: string, enum: ['Customer', 'Owner'] }
 *     LoginResponse:
 *       type: object
 *       properties:
 *         message: { type: string }
 *         token: { type: string, description: "JWT Token for authentication" }
 */

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Create a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserSignup'
 *     responses:
 *       201:
 *         description: Account created successfully
 */
router.post('/signup', authController.signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and get token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 */
router.post('/login', authController.login);


/**
 * @swagger
 * /api/auth/account-summary:
 *   get:
 *     summary: Get current user account details
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account summary retrieved successfully
 */
// Use 'authenticate' to ensure the request has a valid JWT
router.get('/account-summary', authenticate, authController.getAccountSummary);


/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset OTP via SMS
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: Reset OTP sent
 */
router.post('/forgot-password', authController.requestPasswordReset);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Verify OTP and set a new password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp, newPassword]
 *             properties:
 *               phone: { type: string, example: "+2348012345678" }
 *               otp: { type: string, example: "123456" }
 *               newPassword: { type: string, example: "SecurePass123!" }
 *     responses:
 *       200:
 *         description: Password updated successfully
 */
router.post('/reset-password', authController.resetPassword);

/**
 * @swagger
 * /api/auth/delete-account:
 *   delete:
 *     summary: Delete the current user account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 */
router.delete('/delete-account', authenticate, authorize(['Owner', 'Customer']), authController.deleteAccount);

module.exports = router;
