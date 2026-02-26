const db     = require('../configs/connect');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

// Export multer middleware so routes can use it
exports.uploadProfilePicture  = upload.single('profile_picture');
exports.uploadBusinessLogo    = upload.single('business_logo');
exports.uploadBoth            = upload.fields([
  { name: 'profile_picture', maxCount: 1 },
  { name: 'business_logo',   maxCount: 1 }
]);

// Helper: convert buffer to base64 data URI
const toBase64 = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

// ─── GET /api/settings/profile ────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT id, first_name, last_name, email, phone, profile_picture,
              account_type, status, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!users[0]) return res.status(404).json({ message: 'User not found' });

    let data = { ...users[0] };

    if (req.user.account_type === 'Owner') {
      const [biz] = await db.execute(
        'SELECT * FROM business_settings WHERE user_id = ?', [req.user.id]
      );
      data.business = biz[0] || null;
    }

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/settings/profile ─────────────────────────────────────────────
// Handles multipart/form-data (file uploads) AND plain JSON
// Customer fields: first_name, last_name, phone, profile_picture (file)
// Owner adds:      business_name, business_description, business_phone, business_logo (file)
exports.updateProfile = async (req, res) => {
  const {
    first_name, last_name, phone,
    business_name, business_phone, business_description
  } = req.body;

  try {
    // ── Personal fields ──────────────────────────────────────────────────────
    const userFields = [];
    const userParams = [];

    if (first_name !== undefined)  { userFields.push('first_name = ?');  userParams.push(first_name); }
    if (last_name  !== undefined)  { userFields.push('last_name = ?');   userParams.push(last_name); }
    if (phone      !== undefined)  { userFields.push('phone = ?');       userParams.push(phone); }

    // Profile picture — from file upload or plain string URL
    if (req.files?.profile_picture?.[0]) {
      userFields.push('profile_picture = ?');
      userParams.push(toBase64(req.files.profile_picture[0]));
    } else if (req.file && req.file.fieldname === 'profile_picture') {
      userFields.push('profile_picture = ?');
      userParams.push(toBase64(req.file));
    } else if (req.body.profile_picture !== undefined) {
      userFields.push('profile_picture = ?');
      userParams.push(req.body.profile_picture);
    }

    if (userFields.length > 0) {
      userParams.push(req.user.id);
      await db.execute(
        `UPDATE users SET ${userFields.join(', ')} WHERE id = ?`, userParams
      );
    }

    // ── Business fields (Owner only) ─────────────────────────────────────────
    if (req.user.account_type === 'Owner') {
      const hasBizText = business_name !== undefined ||
                         business_phone !== undefined ||
                         business_description !== undefined;
      const hasLogo    = req.files?.business_logo?.[0] ||
                         req.body.business_logo !== undefined;

      if (hasBizText || hasLogo) {
        let logoValue = null;
        if (req.files?.business_logo?.[0]) {
          logoValue = toBase64(req.files.business_logo[0]);
        } else if (req.body.business_logo !== undefined) {
          logoValue = req.body.business_logo;
        }

        await db.execute(
          `INSERT INTO business_settings
             (user_id, business_name, business_phone, business_logo, business_description)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             business_name        = COALESCE(VALUES(business_name),        business_name),
             business_phone       = COALESCE(VALUES(business_phone),       business_phone),
             business_logo        = COALESCE(VALUES(business_logo),        business_logo),
             business_description = COALESCE(VALUES(business_description), business_description)`,
          [req.user.id, business_name, business_phone, logoValue, business_description]
        );
      }
    }

    // ── Return updated profile ────────────────────────────────────────────────
    const [updated] = await db.execute(
      `SELECT id, first_name, last_name, email, phone, profile_picture,
              account_type, status, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    let data = { ...updated[0] };

    if (req.user.account_type === 'Owner') {
      const [biz] = await db.execute(
        'SELECT * FROM business_settings WHERE user_id = ?', [req.user.id]
      );
      data.business = biz[0] || null;
    }

    res.status(200).json({ status: 'success', message: 'Profile updated', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/settings/change-password ─────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ message: 'current_password and new_password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  // Optional confirm check if frontend sends it
  if (confirm_password && new_password !== confirm_password) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT password_hash FROM users WHERE id = ?', [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(new_password, 12);
    await db.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?', [hashed, req.user.id]
    );

    res.status(200).json({ status: 'success', message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/settings/notifications ─────────────────────────────────────────
// Returns the 5 toggle states shown on the notifications screen
exports.getNotificationPrefs = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT payment_reminders, booking_updates
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/settings/notifications ───────────────────────────────────────
// Toggles: payment_reminders, booking_updates (Stock Alerts + Redemption Updates)
exports.updateNotificationPrefs = async (req, res) => {
  const { payment_reminders, booking_updates } = req.body;

  try {
    const fields = [];
    const params = [];

    if (payment_reminders !== undefined) { fields.push('payment_reminders = ?'); params.push(payment_reminders ? 1 : 0); }
    if (booking_updates   !== undefined) { fields.push('booking_updates = ?');   params.push(booking_updates   ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No preferences provided' });
    }

    params.push(req.user.id);
    await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

    const [updated] = await db.execute(
      `SELECT payment_reminders, booking_updates FROM users WHERE id = ?`,
      [req.user.id]
    );

    res.status(200).json({ status: 'success', message: 'Preferences updated', data: updated[0] });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/settings/business ──────────────────────────────────────────────
exports.getBusinessSettings = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM business_settings WHERE user_id = ?', [req.user.id]
    );
    res.status(200).json({
      status: 'success',
      data: rows[0] || {}
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/settings/user-status/:id ─────────────────────────────────────
exports.updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Active', 'Suspended', 'Deactivated'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be: ${validStatuses.join(', ')}` });
  }

  try {
    const [result] = await db.execute(
      `UPDATE users SET status = ? WHERE id = ? AND account_type = 'Customer'`,
      [status, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.status(200).json({ status: 'success', message: `Customer ${status.toLowerCase()}` });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};