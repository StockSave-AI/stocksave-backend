const router = require('express').Router();
const inventory = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/authMiddleware');


router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Stock board and food booking
 */
/**
 * @openapi
 * /api/inventory/products:
 *   get:
 *     summary: Get all products with images and variants
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/products', inventory.getAllProductsWithImages);

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Get stock board - all available food items
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success - returns items, categories, and low stock alerts
 *       401:
 *         description: Unauthorized - Invalid or missing token
 */
router.get('/', inventory.getStockBoard);

/**
 * @swagger
 * /api/inventory/categories:
 *   get:
 *     summary: Get food categories and products for dropdown
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success - Categories with nested products and variants
 */
router.get('/categories', inventory.getCategories);

/**
 * @swagger
 * /api/inventory/my-bookings:
 *   get:
 *     summary: Get current user booking history
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of current customer's bookings
 *       403:
 *         description: Forbidden - Only Customers can access this
 */
router.get('/my-bookings', authorize(['Customer']), inventory.getMyBookings);

/**
 * @swagger
 * /api/inventory/all-bookings:
 *   get:
 *     summary: Get all bookings across all users (Owner only)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all global bookings
 *       403:
 *         description: Forbidden - Only Owners can access this
 */
router.get('/all-bookings', authorize(['Owner']), inventory.getAllBookings);

/**
 * @swagger
 * /api/inventory/book:
 *   post:
 *     summary: Book food slots using savings balance
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [inventory_id, slots_booked]
 *             properties:
 *               inventory_id:
 *                 type: integer
 *                 description: The ID of the inventory item
 *                 example: 1
 *               slots_booked:
 *                 type: integer
 *                 description: Number of slots to reserve
 *                 example: 2
 *     responses:
 *       200:
 *         description: Booking successful
 *       400:
 *         description: Insufficient balance or slots unavailable
 *       403:
 *         description: Forbidden - Only Customers can book
 */
router.post('/book', authorize(['Customer']), inventory.bookFoodItem);

/**
 * @swagger
 * /api/inventory/add:
 *   post:
 *     summary: Add new inventory stock (Owner only)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_variant_id, total_slots]
 *             properties:
 *               product_variant_id:
 *                 type: integer
 *                 example: 1
 *               total_slots:
 *                 type: integer
 *                 example: 100
 *     responses:
 *       201:
 *         description: Inventory added successfully
 *       403:
 *         description: Forbidden - Owner role required
 */
router.post('/add', authorize(['Owner']), inventory.addInventory);

/**
 * @swagger
 * /api/inventory/{id}:
 *   get:
 *     summary: Get single inventory item details
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the inventory item
 *     responses:
 *       200:
 *         description: Item details retrieved
 *       404:
 *         description: Inventory item not found
 */
router.get('/:id', inventory.getInventoryItem);

module.exports = router;
