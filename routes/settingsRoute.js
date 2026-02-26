const express = require('express');
const router  = express.Router();
const s = require('../controllers/settingsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Profile, password and business settings
 */

router.use(authenticate);

// ─── SHARED (Customer & Owner) ────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/profile:
 *   get:
 *     summary: Get profile
 *     description: >
 *       Returns the logged-in user's profile.
 *       Owner also gets a `business` object with business_name, business_phone, business_logo, business_description.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 id: 1
 *                 first_name: John
 *                 last_name: Doe
 *                 email: john@test.com
 *                 phone: "07066505205"
 *                 profile_picture: null
 *                 account_type: Customer
 *                 status: Active
 *                 created_at: "2026-02-19T00:00:00.000Z"
 */
router.get('/profile', s.getProfile);

/**
 * @swagger
 * /api/settings/profile:
 *   patch:
 *     summary: Update profile
 *     description: >
 *       Accepts multipart/form-data (for image upload) OR application/json (text only).
 *       Owner can also update business fields in the same request.
 *       Images are stored as base64. Max size 2MB.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:           { type: string, example: John }
 *               last_name:            { type: string, example: Doe }
 *               phone:                { type: string, example: "07066505205" }
 *               profile_picture:      { type: string, format: binary, description: "Image file — PNG or JPG, max 2MB" }
 *               business_name:        { type: string, description: "Owner only", example: "Amaka Food Store" }
 *               business_phone:       { type: string, description: "Owner only", example: "+2348034567890" }
 *               business_description: { type: string, description: "Owner only" }
 *               business_logo:        { type: string, format: binary, description: "Owner only — max 2MB" }
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:      { type: string }
 *               last_name:       { type: string }
 *               phone:           { type: string }
 *               profile_picture: { type: string, description: "Image URL or base64 string" }
 *           example:
 *             first_name: John
 *             last_name: Gabriel
 *             phone: "07066505205"
 *     responses:
 *       200:
 *         description: Updated profile returned
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Profile updated
 *               data:
 *                 first_name: John
 *                 last_name: Doe
 *                 phone: "07066505205"
 *                 profile_picture: "data:image/jpeg;base64,..."
 */
router.patch('/profile', s.uploadBoth, s.updateProfile);

/**
 * @swagger
 * /api/settings/change-password:
 *   patch:
 *     summary: Change password
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password:  { type: string, example: "OldPass123!" }
 *               new_password:      { type: string, example: "NewPass456!", description: "Min 8 characters" }
 *               confirm_password:  { type: string, example: "NewPass456!", description: "Optional — must match new_password" }
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Password updated successfully
 *       400:
 *         description: Wrong current password, too short, or passwords don't match
 *         content:
 *           application/json:
 *             examples:
 *               wrong_password:
 *                 value: { message: "Current password is incorrect" }
 *               too_short:
 *                 value: { message: "New password must be at least 8 characters" }
 *               mismatch:
 *                 value: { message: "Passwords do not match" }
 */
router.patch('/change-password', s.changePassword);

// ─── OWNER ONLY ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/business:
 *   get:
 *     summary: Get business settings (Owner only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile data
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 business_name: Amaka Food Store
 *                 business_phone: "+2348034567890"
 *                 business_logo: "data:image/png;base64,..."
 *                 business_description: Premium food store in Lagos
 */
router.get('/business', authorize(['Owner']), s.getBusinessSettings);

/**
 * @swagger
 * /api/settings/user-status/{id}:
 *   patch:
 *     summary: Suspend, activate or deactivate a customer (Owner only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Customer user ID
 *         schema: { type: integer, example: 5 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Active, Suspended, Deactivated]
 *                 example: Suspended
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Customer suspended
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Customer not found
 */
router.patch('/user-status/:id', authorize(['Owner']), s.updateUserStatus);

module.exports = router;