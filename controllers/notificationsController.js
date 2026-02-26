const db = require('../configs/connect');

// ─── GET /api/notifications/summary ───────────────────────────────────────────
exports.getAlertSummary = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[lowStock]] = await db.execute(
      `SELECT COUNT(*) AS count FROM (
        SELECT product_variant_id FROM stock_entries
        GROUP BY product_variant_id
        HAVING SUM(quantity_remaining) < 10
      ) AS ls`
    );
    const [[fullyBooked]] = await db.execute(
      `SELECT COUNT(*) AS count FROM (
        SELECT product_variant_id FROM stock_entries
        GROUP BY product_variant_id
        HAVING SUM(quantity_remaining) = 0
      ) AS fb`
    );
    const [[pendingPayments]] = await db.execute(
      `SELECT COUNT(*) AS count FROM transactions WHERE status = 'Pending'`
    );
    const [[newUsers]] = await db.execute(
      `SELECT COUNT(*) AS count FROM users
       WHERE account_type = 'Customer'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
    const [[unread]] = await db.execute(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`, [userId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        low_stock_alerts: lowStock.count,
        fully_booked_products: fullyBooked.count,
        pending_payments: pendingPayments.count,
        new_signups: newUsers.count,
        unread_notifications: unread.count,
        total_alerts: lowStock.count + fullyBooked.count + pendingPayments.count + newUsers.count
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/feed ─────────────────────────────────────────────
exports.getOwnerFeed = async (req, res) => {
  const userId   = req.user.id;
  const type     = req.query.type   || null;
  const limitNum = parseInt(req.query.limit) || 20;
  const page     = parseInt(req.query.page)  || 1;
  const offset   = (page - 1) * limitNum;

  try {
    let where    = 'WHERE user_id = ?';
    const params = [userId];
    if (type) { where += ' AND type = ?'; params.push(type); }

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
    const [[unreadRow]] = await db.execute(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`, [userId]
    );
    const [[weekRow]] = await db.execute(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`, [userId]
    );

    res.status(200).json({
      status: 'success',
      stats: { unread: unreadRow.count, this_week: weekRow.count, total },
      pagination: { page, limit: limitNum, total, total_pages: Math.ceil(total / limitNum) },
      data: rows
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/new-users ────────────────────────────────────────
exports.getNewUsers = async (req, res) => {
  const days     = parseInt(req.query.days)  || 7;
  const limitNum = parseInt(req.query.limit) || 20;
  try {
    const [users] = await db.execute(
      `SELECT
        id, first_name, last_name, email, phone,
        status, balance, created_at,
        TIMESTAMPDIFF(HOUR, created_at, NOW()) AS hours_since_signup
       FROM users
       WHERE account_type = 'Customer'
       AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
       ORDER BY created_at DESC
       LIMIT ${limitNum}`
    );
    res.status(200).json({
      status: 'success',
      period: `Last ${days} days`,
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/pending-payments ─────────────────────────────────
exports.getPendingPayments = async (req, res) => {
  try {
    const [pending] = await db.execute(
      `SELECT
        t.id AS transaction_id, t.user_id,
        u.first_name, u.last_name, u.email, u.phone,
        t.amount, t.method, t.type, t.reference, t.created_at,
        TIMESTAMPDIFF(HOUR, t.created_at, NOW()) AS hours_pending
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.status = 'Pending'
       ORDER BY t.created_at ASC`
    );
    res.status(200).json({ status: 'success', count: pending.length, data: pending });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/low-stock ────────────────────────────────────────
exports.getLowStockAlerts = async (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;
  try {
    const [alerts] = await db.execute(
      `SELECT
        se.product_variant_id,
        fp.product_name,
        pv.size_label,
        SUM(se.quantity_remaining) AS total_stock
       FROM stock_entries se
       JOIN product_variants pv ON se.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       GROUP BY se.product_variant_id, fp.product_name, pv.size_label
       HAVING total_stock < ${threshold}
       ORDER BY total_stock ASC`
    );
    res.status(200).json({ status: 'success', threshold, alert_count: alerts.length, data: alerts });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/fully-booked ─────────────────────────────────────
exports.getFullyBookedAlerts = async (req, res) => {
  try {
    const [fullyBooked] = await db.execute(
      `SELECT
        se.product_variant_id,
        fp.product_name,
        pv.size_label,
        pv.price,
        SUM(se.quantity_remaining) AS total_stock,
        SUM(se.quantity_added) AS total_ever_added
       FROM stock_entries se
       JOIN product_variants pv ON se.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       GROUP BY se.product_variant_id, fp.product_name, pv.size_label, pv.price
       HAVING total_stock = 0`
    );
    res.status(200).json({
      status: 'success',
      count: fullyBooked.length,
      message: fullyBooked.length > 0 ? `${fullyBooked.length} product(s) fully booked` : 'No fully booked products',
      data: fullyBooked
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/reconciliation ───────────────────────────────────
exports.getReconciliation = async (req, res) => {
  try {
    const [[summary]] = await db.execute(
      `SELECT
        SUM(CASE WHEN type='Deposit'      AND status='Completed'                  THEN amount ELSE 0 END) AS total_deposits,
        SUM(CASE WHEN type='Refund'       AND status='Completed'                  THEN amount ELSE 0 END) AS total_refunds,
        SUM(CASE WHEN type='Withdrawal'   AND status IN('Completed','Processing') THEN amount ELSE 0 END) AS total_withdrawals,
        SUM(CASE WHEN type='Booking_Hold' AND status='Completed'                 THEN amount ELSE 0 END) AS total_booking_holds,
        SUM(CASE WHEN status='Pending'    AND type='Deposit'                     THEN amount ELSE 0 END) AS total_pending_deposits,
        SUM(CASE WHEN status='Pending'    AND type='Withdrawal'                  THEN amount ELSE 0 END) AS total_pending_withdrawals,
        SUM(CASE WHEN status='Pending'                                           THEN amount ELSE 0 END) AS total_pending
       FROM transactions`
    );
    const netBalance = summary.total_deposits - summary.total_withdrawals - summary.total_booking_holds;
    res.status(200).json({
      status: 'success',
      data: {
        total_deposits:            parseFloat(summary.total_deposits)            || 0,
        total_refunds:             parseFloat(summary.total_refunds)             || 0,
        total_withdrawals:         parseFloat(summary.total_withdrawals)         || 0,
        total_booking_holds:       parseFloat(summary.total_booking_holds)       || 0,
        total_pending:             parseFloat(summary.total_pending)             || 0,
        total_pending_deposits:    parseFloat(summary.total_pending_deposits)    || 0,
        total_pending_withdrawals: parseFloat(summary.total_pending_withdrawals) || 0,
        net_balance:               parseFloat(netBalance)                        || 0,
        is_balanced:               netBalance >= 0
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/stock-match/:variantId ───────────────────────────
exports.matchStockToBooking = async (req, res) => {
  const { variantId } = req.params;
  try {
    const [batches] = await db.execute(
      `SELECT
        se.id AS stock_batch_id,
        se.quantity_remaining,
        se.date_added,
        fp.product_name,
        pv.size_label
       FROM stock_entries se
       JOIN product_variants pv ON se.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       WHERE pv.id = ? AND se.quantity_remaining > 0
       ORDER BY se.date_added ASC`,
      [variantId]
    );
    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity_remaining, 0);
    res.status(200).json({
      status: 'success',
      data: { variant_id: parseInt(variantId), total_available: totalAvailable, batches_available: batches.length, batches }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/notifications/mark-all ───────────────────────────────────────
exports.markAllAsRead = async (req, res) => {
  const userId = req.user.id;
  try {
    const [result] = await db.execute(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]
    );
    res.status(200).json({ status: 'success', message: 'All notifications marked as read', updated: result.affectedRows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────
exports.markOneAsRead = async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  try {
    const [result] = await db.execute(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Notification not found' });
    res.status(200).json({ status: 'success', message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── DELETE /api/notifications/clear-all ─────────────────────────────────────
exports.clearAll = async (req, res) => {
  const userId = req.user.id;
  try {
    const [result] = await db.execute(
      `DELETE FROM notifications WHERE user_id = ?`, [userId]
    );
    res.status(200).json({ status: 'success', message: 'All notifications cleared', deleted: result.affectedRows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────
exports.clearOne = async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  try {
    const [result] = await db.execute(
      `DELETE FROM notifications WHERE id = ? AND user_id = ?`, [id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Notification not found' });
    res.status(200).json({ status: 'success', message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};