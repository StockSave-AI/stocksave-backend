const express = require('express');
const router  = express.Router();
const s = require('../controllers/settingsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Profile, password, notifications and business settings
 */

router.use(authenticate);

// ─── SHARED (Customer & Owner) ────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/profile:
 *   get:
 *     summary: Get profile. Owner also gets business object.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           Customer — id, first_name, last_name, email, phone, profile_picture, status, created_at
 *           Owner — same + business { business_name, business_phone, business_logo, business_description }
 */
router.get('/profile', s.getProfile);

/**
 * @swagger
 * /api/settings/profile:
 *   patch:
 *     summary: Update profile. Accepts multipart/form-data for image uploads OR application/json for text-only.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:           { type: string }
 *               last_name:            { type: string }
 *               phone:                { type: string }
 *               profile_picture:      { type: string, format: binary, description: Image file max 2MB }
 *               business_name:        { type: string, description: Owner only }
 *               business_phone:       { type: string, description: Owner only }
 *               business_description: { type: string, description: Owner only }
 *               business_logo:        { type: string, format: binary, description: Owner only, max 2MB }
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:      { type: string }
 *               last_name:       { type: string }
 *               phone:           { type: string }
 *               profile_picture: { type: string, description: Image URL or base64 }
 *     responses:
 *       200:
 *         description: Updated profile returned
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
 *               current_password:  { type: string }
 *               new_password:      { type: string, description: Min 8 characters }
 *               confirm_password:  { type: string, description: Optional - must match new_password }
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Wrong current password, too short, or mismatch
 */
router.patch('/change-password', s.changePassword);

// ─── CUSTOMER ONLY ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/notifications:
 *   get:
 *     summary: Get notification toggle states (Customer)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: payment_reminders, booking_updates, email_notifications, sms_notifications
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 payment_reminders: 1
 *                 booking_updates: 0
 *                 email_notifications: 1
 *                 sms_notifications: 0
 */
router.get('/notifications', authorize(['Customer']), s.getNotificationPrefs);

/**
 * @swagger
 * /api/settings/notifications:
 *   patch:
 *     summary: Update notification toggles (Customer)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payment_reminders:   { type: boolean, description: "Payment Reminders toggle" }
 *               booking_updates:     { type: boolean, description: "Stock Alerts + Redemption Updates toggle" }
 *               email_notifications: { type: boolean, description: "Email Notifications toggle" }
 *               sms_notifications:   { type: boolean, description: "SMS Notifications toggle" }
 *           example:
 *             payment_reminders: true
 *             booking_updates: true
 *             email_notifications: false
 *             sms_notifications: false
 *     responses:
 *       200:
 *         description: Preferences updated — returns new values
 */
router.patch('/notifications', authorize(['Customer']), s.updateNotificationPrefs);

// ─── OWNER ONLY ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/settings/business:
 *   get:
 *     summary: Get business settings (Owner)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: business_name, business_phone, business_logo, business_description
 */
router.get('/business', authorize(['Owner']), s.getBusinessSettings);

/**
 * @swagger
 * /api/settings/user-status/{id}:
 *   patch:
 *     summary: Suspend, activate or deactivate a customer (Owner)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [Active, Suspended, Deactivated] }
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Customer not found
 */
router.patch('/user-status/:id', authorize(['Owner']), s.updateUserStatus);

module.exports = router;