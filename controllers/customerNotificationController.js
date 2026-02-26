const db = require('../configs/connect');

// ─── HELPER: Create a notification ───────────────────────────────────────────
// Call this from other controllers when events happen
exports.createNotification = async (userId, type, title, message, referenceId = null, referenceType = null) => {
  try {
    await db.execute(
      `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, type, title, message, referenceId, referenceType]
    );
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
};

// ─── GET /api/customer/notifications ─────────────────────────────────────────
// All notifications for the logged-in customer
exports.getNotifications = async (req, res) => {
  const userId = req.user.id;
  const type = req.query.type || null;
  const unreadOnly = req.query.unread === 'true';
  const limitNum = parseInt(req.query.limit) || 20;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limitNum;

  try {
    let where = 'WHERE user_id = ?';
    const params = [userId];

    if (type) { where += ' AND type = ?'; params.push(type); }
    if (unreadOnly) { where += ' AND is_read = 0'; }

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM notifications ${where}`, params
    );

    const [rows] = await db.execute(
      `SELECT id, type, title, message, is_read, reference_id, reference_type, created_at
       FROM notifications ${where}
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );

    // Count stats
    const [[unreadRow]] = await db.execute(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]
    );
    const [[weekRow]] = await db.execute(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`, [userId]
    );

    res.status(200).json({
      status: 'success',
      stats: {
        unread: unreadRow.count,
        this_week: weekRow.count,
        total
      },
      pagination: {
        page,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum)
      },
      data: rows
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/customer/notifications/:id ────────────────────────────────────
// Mark single notification as read
exports.markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [result] = await db.execute(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ status: 'success', message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/customer/notifications/mark-all ───────────────────────────────
// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  const userId = req.user.id;

  try {
    const [result] = await db.execute(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
      updated: result.affectedRows
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/customer/notifications/stock-alerts ────────────────────────────
// Recent stock additions - for stock alert tab
exports.getStockAlerts = async (req, res) => {
  const limitNum = parseInt(req.query.limit) || 20;
  const days = parseInt(req.query.days) || 30;

  try {
    const [rows] = await db.execute(
      `SELECT
        se.id AS stock_entry_id,
        fp.product_name,
        fp.image_url,
        fp.category,
        pv.size_label,
        pv.price,
        se.quantity_added,
        se.quantity_remaining,
        se.date_added AS created_at,
        si.slots_remaining,
        si.status AS availability
       FROM stock_entries se
       JOIN product_variants pv ON se.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       LEFT JOIN shared_inventory si ON si.product_variant_id = pv.id
       WHERE se.date_added >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
       ORDER BY se.date_added DESC
       LIMIT ${limitNum}`
    );

    res.status(200).json({
      status: 'success',
      period: `Last ${days} days`,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── DELETE /api/customer/notifications/:id ───────────────────────────────────
// Delete a single notification
exports.deleteNotification = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [result] = await db.execute(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ status: 'success', message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};