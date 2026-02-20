const router = require('express').Router();
const plans = require('../controllers/planController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize(['Customer']));

/**
 * @swagger
 * tags:
 *   name: Plans
 *   description: Payment plan management screen
 */

/**
 * @swagger
 * /api/plans:
 *   get:
 *     summary: Get full payment plan screen data
 *     description: Returns current plan, progress stats, payment history, upcoming payments and settings
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full plan data
 */
router.get('/', plans.getMyPlan);

/**
 * @swagger
 * /api/plans:
 *   post:
 *     summary: Create a new payment plan
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan_type, amount, duration_months, start_date]
 *             properties:
 *               plan_type:
 *                 type: string
 *                 enum: [Monthly, Weekly, Daily]
 *                 example: Monthly
 *               amount:
 *                 type: number
 *                 example: 5000
 *               target_amount:
 *                 type: number
 *                 example: 60000
 *               duration_months:
 *                 type: integer
 *                 example: 12
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-01-01"
 *     responses:
 *       201:
 *         description: Plan created
 *       400:
 *         description: Missing required fields
 */
router.post('/', plans.createPlan);

/**
 * @swagger
 * /api/plans/{id}:
 *   put:
 *     summary: Modify plan amount or frequency
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_type:
 *                 type: string
 *                 enum: [Monthly, Weekly, Daily]
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Plan updated
 */
router.put('/:id', plans.updatePlan);

/**
 * @swagger
 * /api/plans/{id}/pause:
 *   post:
 *     summary: Pause an active plan (Pause Plan button)
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan paused
 */
router.post('/:id/pause', plans.pausePlan);

/**
 * @swagger
 * /api/plans/{id}/resume:
 *   post:
 *     summary: Resume a paused plan
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan resumed
 */
router.post('/:id/resume', plans.resumePlan);

/**
 * @swagger
 * /api/plans/{id}/settings:
 *   patch:
 *     summary: Update plan settings (auto-renewal, reminders, auto-debit toggles)
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               auto_renewal:
 *                 type: boolean
 *                 example: true
 *               payment_reminders:
 *                 type: boolean
 *                 example: true
 *               auto_debit:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.patch('/:id/settings', plans.updateSettings);

/**
 * @swagger
 * /api/plans/{id}:
 *   delete:
 *     summary: Cancel a plan
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan cancelled
 */
router.delete('/:id', plans.cancelPlan);

module.exports = router;