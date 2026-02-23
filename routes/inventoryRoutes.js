const router = require('express').Router();
const inventory = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Stock board, food booking and FIFO batch tracking
 */

router.use(authenticate);

// ─── CUSTOMER & OWNER ─────────────────────────────────────

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Get full stock board with low stock alerts
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Items, categories, images and low stock alerts
 */
router.get('/', inventory.getStockBoard);

/**
 * @swagger
 * /api/inventory/categories:
 *   get:
 *     summary: Get food categories with nested products and variants for dropdown
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories → Products → Variants with image_url
 */
router.get('/categories', inventory.getCategories);

/**
 * @swagger
 * /api/inventory/my-bookings:
 *   get:
 *     summary: Get logged-in customer's booking history
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer bookings with product and cost details
 */
router.get('/my-bookings', authorize(['Customer']), inventory.getMyBookings);

/**
 * @swagger
 * /api/inventory/all-bookings:
 *   get:
 *     summary: Get all bookings across all customers (Owner only)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All bookings with customer details
 */
router.get('/all-bookings', authorize(['Owner']), inventory.getAllBookings);

/**
 * @swagger
 * /api/inventory/stock-batches/{variantId}:
 *   get:
 *     summary: View FIFO stock batches for a product variant (Owner only)
 *     description: >
 *       Returns all stock_entries for a variant ordered oldest first (FIFO order).
 *       Shows how much stock remains in each batch.
 *       Useful for the owner to track which batches are being consumed first.
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         description: product_variants.id
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: FIFO batch list with total remaining
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_remaining: { type: integer, example: 75 }
 *                     batch_count: { type: integer, example: 3 }
 *                     batches:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           quantity_added: { type: integer }
 *                           quantity_remaining: { type: integer }
 *                           date_added: { type: string, format: date-time }
 *                           product_name: { type: string }
 *                           size_label: { type: string }
 */
router.get('/stock-batches/:variantId', authorize(['Owner']), inventory.getStockBatches);

/**
 * @swagger
 * /api/inventory/book:
 *   post:
 *     summary: Book food slots using savings balance (FIFO stock deduction)
 *     description: >
 *       Books slots and deducts from the oldest stock batch first (FIFO).
 *       If the oldest batch doesn't have enough, it moves to the next batch automatically.
 *       Balance is deducted immediately. Inventory closes when fully booked.
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
 *               inventory_id: { type: integer, example: 1 }
 *               slots_booked: { type: integer, example: 2 }
 *     responses:
 *       200:
 *         description: Booked successfully
 *       400:
 *         description: Insufficient balance, slots or physical stock
 *       404:
 *         description: Inventory not found or closed
 */
router.post('/book', authorize(['Customer']), inventory.bookFoodItem);

/**
 * @swagger
 * /api/inventory/add:
 *   post:
 *     summary: Add new inventory stock (Owner only)
 *     description: >
 *       Creates a shared_inventory record and a stock_entries batch for FIFO tracking.
 *       Each call creates one new batch. Multiple calls for the same product_variant_id
 *       create separate batches consumed oldest-first during booking.
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
 *                 description: ID from product_variants. Use GET /api/inventory/categories to find valid IDs.
 *                 example: 1
 *               total_slots:
 *                 type: integer
 *                 description: Number of slots to make available for booking
 *                 example: 100
 *     responses:
 *       201:
 *         description: Inventory and FIFO batch created
 *       400:
 *         description: Missing fields
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
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Item details with product name, image, price and slots
 *       404:
 *         description: Not found
 */
router.get('/:id', inventory.getInventoryItem);

module.exports = router;
