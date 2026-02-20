const router = require('express').Router();
const savings = require('../controllers/savingsController'); 
const customer = require('../controllers/CustomerdashController');
const plans= require('../controllers/planController');
const { authenticate, authorize } = require('../middleware/authMiddleware');


//  Paystack routes - NO auth middleware (Paystack calls these, not the user)
router.post('/webhook', savings.handlePaystackWebhook);
router.get('/verify', savings.verifyPaystackPayment);

router.use(authenticate, authorize(['Customer']));

/**
 * @swagger
 * tags:
 *   name: Customer
 *   description: Customer dashboard and action routes
 */

// --- MAIN DASHBOARD ---
/**
 * @swagger
 * /api/customer/summary:
 *   get:
 *     summary: Get customer dashboard overview
 *     tags: [Customer]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success - Returns total savings, progress, and recent activity
 */
router.get('/summary', customer.getCustomerDashboard);

/**
 * @swagger
 * /api/customer/deposit:
 *   post:
 *     summary: Add savings from the customer dashboard
 *     tags: [Customer]
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
 *         description: Deposit initiated (returns payment_url for Paystack)
 *       400:
 *         description: Invalid amount or method
 */
router.post('/deposit', savings.addSavings); 


//  Paystack routes - NO auth middleware (Paystack calls these, not the user)
router.post('/webhook', savings.handlePaystackWebhook);
router.get('/verify', savings.verifyPaystackPayment);


// --- SIDEBAR & ACTION ROUTES ---

router.get('/plans', customer.managePlans); 
//router.get('/stock-board', customer.getStockBoard); 
//router.post('/book-food', customer.bookFoodItems); 
//router.post('/withdraw', customer.redeemSavings); 
//router.get('/notifications', customer.getNotifications); 
//router.get('/settings', customer.getSettings); 

module.exports = router;