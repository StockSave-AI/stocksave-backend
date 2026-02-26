const express = require('express');
const router = express.Router();
const plan = require('../controllers/planController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Plans
 *   description: Payment plan management - Basic (Daily), Standard (Weekly), Premium (Monthly)
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     PlanDetails:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         plan_type:
 *           type: string
 *           enum: [Daily, Weekly, Monthly]
 *           example: Weekly
 *         amount: { type: number, example: 2000 }
 *         duration: { type: integer, example: 12 }
 *         duration_unit:
 *           type: string
 *           enum: [days, weeks, months]
 *           example: weeks
 *         start_date: { type: string, format: date, example: "2026-03-01" }
 *         end_date: { type: string, format: date, example: "2026-05-24" }
 *         next_payment_date: { type: string, format: date, example: "2026-03-08" }
 *         target_amount: { type: number, example: 24000 }
 *         status:
 *           type: string
 *           enum: [Active, Paused, Completed, Cancelled]
 *           example: Active
 */

router.use(authenticate, authorize(['Customer']));

/**
 * @swagger
 * /api/plans:
 *   get:
 *     summary: Get current active or paused plan with full details
 *     description: >
 *       Returns the customer's current plan including progress, payment history,
 *       upcoming 3 payments and plan settings.
 *       duration_unit tells the frontend whether duration is in days, weeks or months.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Plan data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     current_plan:
 *                       $ref: '#/components/schemas/PlanDetails'
 *                     progress:
 *                       type: object
 *                       properties:
 *                         payments_made: { type: integer, example: 4 }
 *                         total_payments: { type: integer, example: 12 }
 *                         payments_remaining: { type: integer, example: 8 }
 *                         payments_missed: { type: integer, example: 1 }
 *                         on_time_percentage: { type: number, example: 75 }
 *                         total_saved: { type: number, example: 8000 }
 *                         target_amount: { type: number, example: 24000 }
 *                         saved_percentage: { type: number, example: 33.3 }
 *                     payment_history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           amount: { type: number }
 *                           method: { type: string }
 *                           status: { type: string }
 *                           created_at: { type: string, format: date-time }
 *                     upcoming_payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date: { type: string, format: date }
 *                           amount: { type: number }
 *                           days_until: { type: integer }
 *                           label: { type: string, example: "in 7 days" }
 *                     settings:
 *                       type: object
 *                       properties:
 *                         auto_renewal: { type: boolean }
 *                         payment_reminders: { type: boolean }
 *                         auto_debit: { type: boolean }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Customers only
 */
router.get('/', plan.getMyPlan);

/**
 * @swagger
 * /api/plans:
 *   post:
 *     summary: Create a new payment plan
 *     description: >
 *       Creates a new plan and cancels any existing active plan automatically.
 *       Minimum amounts per plan type -
 *       Basic (Daily) from ₦500,
 *       Standard (Weekly) from ₦1000,
 *       Premium (Monthly) from ₦5000.
 *       duration counts in the plan's unit - days for Daily, weeks for Weekly, months for Monthly.
 *       end_date and next_payment_date are calculated automatically.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan_type, amount, duration, start_date]
 *             properties:
 *               plan_type:
 *                 type: string
 *                 enum: [Daily, Weekly, Monthly]
 *                 example: Weekly
 *               amount:
 *                 type: number
 *                 description: Amount per payment. Min ₦500 Daily / ₦1000 Weekly / ₦5000 Monthly
 *                 example: 2000
 *               duration:
 *                 type: integer
 *                 description: Number of payments. Counted in days/weeks/months based on plan_type.
 *                 example: 12
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-01"
 *               target_amount:
 *                 type: number
 *                 description: Optional. Defaults to amount × duration.
 *                 example: 24000
 *     responses:
 *       201:
 *         description: Plan created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: Weekly plan created }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan_id: { type: integer, example: 1 }
 *                     end_date: { type: string, example: "2026-05-24" }
 *                     next_payment_date: { type: string, example: "2026-03-08" }
 *       400:
 *         description: Missing fields or below minimum amount
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Customers only
 */
router.post('/', plan.createPlan);

/**
 * @swagger
 * /api/plans/{id}:
 *   put:
 *     summary: Update plan amount, frequency or duration
 *     description: >
 *       Updates any combination of plan fields.
 *       end_date and next_payment_date are always recalculated automatically
 *       based on the resolved plan_type, duration and start_date.
 *       You only need to send the fields you want to change.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_type:
 *                 type: string
 *                 enum: [Daily, Weekly, Monthly]
 *                 example: Weekly
 *               amount:
 *                 type: number
 *                 example: 3000
 *               duration:
 *                 type: integer
 *                 description: Counted in the plan's unit (days/weeks/months)
 *                 example: 12
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-01"
 *               end_date:
 *                 type: string
 *                 format: date
 *                 description: Optional override. Auto-calculated if not provided.
 *                 example: "2026-05-24"
 *               next_payment_date:
 *                 type: string
 *                 format: date
 *                 description: Optional override. Auto-calculated if not provided.
 *                 example: "2026-03-08"
 *               target_amount:
 *                 type: number
 *                 description: Optional override. Defaults to amount × duration.
 *                 example: 36000
 *     responses:
 *       200:
 *         description: Plan updated - returns full updated plan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: Plan updated }
 *                 data:
 *                   $ref: '#/components/schemas/PlanDetails'
 *       400:
 *         description: Below minimum amount for plan type
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Customers only
 *       404:
 *         description: Plan not found
 */
router.put('/:id', plan.updatePlan);

/**
 * @swagger
 * /api/plans/{id}/pause:
 *   post:
 *     summary: Pause an active plan
 *     description: Changes plan status from Active to Paused. Only works on Active plans.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Plan paused
 *       404:
 *         description: Active plan not found
 */
router.post('/:id/pause', plan.pausePlan);

/**
 * @swagger
 * /api/plans/{id}/resume:
 *   post:
 *     summary: Resume a paused plan
 *     description: Changes plan status from Paused back to Active. Only works on Paused plans.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Plan resumed
 *       404:
 *         description: Paused plan not found
 */
router.post('/:id/resume', plan.resumePlan);

/**
 * @swagger
 * /api/plans/{id}/settings:
 *   patch:
 *     summary: Toggle plan settings
 *     description: Update auto_renewal, payment_reminders or auto_debit. Send only the fields to change.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               auto_renewal: { type: boolean, example: true }
 *               payment_reminders: { type: boolean, example: true }
 *               auto_debit: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Settings updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Customers only
 */
router.patch('/:id/settings', plan.updateSettings);

/**
 * @swagger
 * /api/plans/{id}:
 *   delete:
 *     summary: Cancel a plan
 *     description: Sets plan status to Cancelled. This cannot be undone.
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Plan cancelled
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Customers only
 *       404:
 *         description: Plan not found
 */
router.delete('/:id', plan.cancelPlan);

module.exports = router;