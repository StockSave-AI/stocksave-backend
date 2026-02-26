const db = require('../configs/connect');

// DS4-1: Match user booking to available stock batches (FIFO order)
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
      data: {
        variant_id: parseInt(variantId),
        total_available: totalAvailable,
        batches_available: batches.length,
        batches
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/low-stock ─────────────────────
// DS4-2: Products with total stock below threshold (default 10)
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
       HAVING total_stock < ?
       ORDER BY total_stock ASC`,
      [threshold]
    );

    res.status(200).json({
      status: 'success',
      threshold,
      alert_count: alerts.length,
      data: alerts
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/pending-payments ──────────────
// DS4-3: Users with pending transactions (payment reminders)
exports.getPendingPayments = async (req, res) => {
  try {
    const [pending] = await db.execute(
      `SELECT 
        t.id AS transaction_id,
        t.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        t.amount,
        t.method,
        t.type,
        t.reference,
        t.created_at,
        TIMESTAMPDIFF(HOUR, t.created_at, NOW()) AS hours_pending
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.status = 'Pending'
       ORDER BY t.created_at ASC`
    );

    res.status(200).json({
      status: 'success',
      count: pending.length,
      data: pending
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/fully-booked ──────────────────
// DS4-4: Products with zero remaining stock (fully booked alert)
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
      message: fullyBooked.length > 0
        ? `${fullyBooked.length} product(s) fully booked`
        : 'No fully booked products',
      data: fullyBooked
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/reconciliation ────────────────
// DS4-5: Reconciliation - total deposits vs total booking holds
exports.getReconciliation = async (req, res) => {
  try {
    const [[summary]] = await db.execute(
      `SELECT
        SUM(CASE WHEN type = 'Deposit'      AND status = 'Completed' THEN amount ELSE 0 END) AS total_deposits,
        SUM(CASE WHEN type = 'Withdrawal'   AND status IN ('Completed', 'Processing') THEN amount ELSE 0 END) AS total_withdrawals,
        SUM(CASE WHEN type = 'Booking_Hold' AND status = 'Completed' THEN amount ELSE 0 END) AS total_booking_holds,
        SUM(CASE WHEN status = 'Pending' AND type = 'Deposit'    THEN amount ELSE 0 END) AS total_pending_deposits,
        SUM(CASE WHEN status = 'Pending' AND type = 'Withdrawal' THEN amount ELSE 0 END) AS total_pending_withdrawals,
        SUM(CASE WHEN status = 'Pending'                         THEN amount ELSE 0 END) AS total_pending
       FROM transactions`
    );

    const netBalance = summary.total_deposits - summary.total_withdrawals - summary.total_booking_holds;

    res.status(200).json({
      status: 'success',
      data: {
        total_deposits: parseFloat(summary.total_deposits) || 0,
        total_withdrawals: parseFloat(summary.total_withdrawals) || 0,
        total_booking_holds: parseFloat(summary.total_booking_holds) || 0,
        total_pending: parseFloat(summary.total_pending) || 0,
        total_pending_deposits: parseFloat(summary.total_pending_deposits) || 0,
        total_pending_withdrawals: parseFloat(summary.total_pending_withdrawals) || 0,
        net_balance: parseFloat(netBalance) || 0,
        is_balanced: netBalance >= 0
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/notifications/new-users ────────────────────
// Returns customers who signed up recently
exports.getNewUsers = async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const [users] = await db.execute(
      `SELECT 
        id, first_name, last_name, email, phone, 
        status, balance, created_at,
        TIMESTAMPDIFF(HOUR, created_at, NOW()) AS hours_since_signup
       FROM users
       WHERE account_type = 'Customer'
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY created_at DESC
       LIMIT ?`,
      [days, limit]
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

// ─── GET /api/notifications/summary ───────────────────────
// All alerts in one call - for owner dashboard badge counts
exports.getAlertSummary = async (req, res) => {
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

    res.status(200).json({
      status: 'success',
      data: {
        low_stock_alerts: lowStock.count,
        fully_booked_products: fullyBooked.count,
        pending_payments: pendingPayments.count,
        new_signups_last_7_days: newUsers.count,
        total_alerts: lowStock.count + fullyBooked.count + pendingPayments.count + newUsers.count
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};