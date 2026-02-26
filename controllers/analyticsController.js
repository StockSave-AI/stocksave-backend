const db = require('../configs/connect');

exports.getFinancialSummary = async (req, res) => {
  try {
    // 1. Total Revenue (Completed Deposits)
    const [[revenue]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total_revenue
       FROM transactions
       WHERE type = 'Deposit' AND status = 'Completed'`
    );

    // 2. Total Withdrawals (Completed)
    const [[withdrawals]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total_withdrawals
       FROM transactions
       WHERE type = 'Withdrawal' AND status = 'Completed'`
    );

    // 3. Total Pending Deposits
    const [[pending]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total_pending
       FROM transactions
       WHERE type = 'Deposit' AND status = 'Pending'`
    );

    // 4. Total Bookings value
    const [[bookingHolds]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total_booking_holds
       FROM transactions
       WHERE type = 'Booking_Hold'`
    );

    // 5. This month deposits
    const [[thisMonth]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS deposits_this_month
       FROM transactions
       WHERE type = 'Deposit' AND status = 'Completed'
       AND MONTH(created_at) = MONTH(NOW())
       AND YEAR(created_at) = YEAR(NOW())`
    );

    // 6. This week deposits
    const [[thisWeek]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS deposits_this_week
       FROM transactions
       WHERE type = 'Deposit' AND status = 'Completed'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    // 7. This week withdrawals
    const [[thisWeekWd]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS withdrawals_this_week
       FROM transactions
       WHERE type = 'Withdrawal' AND status = 'Completed'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    // 8. Total customer balances (money currently held)
    const [[heldBalance]] = await db.execute(
      `SELECT COALESCE(SUM(balance), 0) AS total_held
       FROM users WHERE account_type = 'Customer'`
    );

    // 9. Active customers with balance > 0
    const [[activeCustomers]] = await db.execute(
      `SELECT COUNT(*) AS count FROM users
       WHERE account_type = 'Customer' AND balance > 0`
    );

    const totalRevenue = parseFloat(revenue.total_revenue);
    const totalWithdrawals = parseFloat(withdrawals.total_withdrawals);

    res.status(200).json({
      status: 'success',
      data: {
        // Summary cards
        total_revenue: totalRevenue,
        total_withdrawals: totalWithdrawals,
        net_balance: totalRevenue - totalWithdrawals,
        total_held_in_accounts: parseFloat(heldBalance.total_held),
        total_pending_deposits: parseFloat(pending.total_pending),
        total_booking_holds: parseFloat(bookingHolds.total_booking_holds),

        // Period breakdowns
        this_week: {
          deposits: parseFloat(thisWeek.deposits_this_week),
          withdrawals: parseFloat(thisWeekWd.withdrawals_this_week),
          net: parseFloat(thisWeek.deposits_this_week) - parseFloat(thisWeekWd.withdrawals_this_week)
        },
        this_month: {
          deposits: parseFloat(thisMonth.deposits_this_month)
        },

        // Customer stats
        active_customers_with_balance: activeCustomers.count
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/analytics/monthly-trend ────────────────────────────────────────
// Monthly breakdown — last 12 months — use for bar/line charts
exports.getMonthlyTrend = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        DATE_FORMAT(created_at, '%b %Y') AS month_label,
        COUNT(*) AS total_transactions,
        SUM(CASE WHEN type = 'Deposit'    AND status = 'Completed' THEN amount ELSE 0 END) AS deposits,
        SUM(CASE WHEN type = 'Withdrawal' AND status = 'Completed' THEN amount ELSE 0 END) AS withdrawals,
        SUM(CASE WHEN type = 'Booking_Hold'                        THEN amount ELSE 0 END) AS booking_holds,
        COUNT(CASE WHEN type = 'Deposit'    AND status = 'Completed' THEN 1 END) AS deposit_count,
        COUNT(CASE WHEN type = 'Withdrawal' AND status = 'Completed' THEN 1 END) AS withdrawal_count
       FROM transactions
       GROUP BY month, month_label
       ORDER BY month DESC
       LIMIT 12`
    );

    // Return in ascending order for charts (oldest first)
    res.status(200).json({
      status: 'success',
      data: rows.reverse()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/analytics/weekly-trend ─────────────────────────────────────────
// Last 8 weeks — use for weekly chart
exports.getWeeklyTrend = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        YEAR(created_at) AS year,
        WEEK(created_at, 1) AS week_number,
        DATE_FORMAT(MIN(created_at), '%d %b') AS week_start,
        SUM(CASE WHEN type = 'Deposit'    AND status = 'Completed' THEN amount ELSE 0 END) AS deposits,
        SUM(CASE WHEN type = 'Withdrawal' AND status = 'Completed' THEN amount ELSE 0 END) AS withdrawals,
        COUNT(CASE WHEN type = 'Deposit'  AND status = 'Completed' THEN 1 END) AS deposit_count,
        COUNT(CASE WHEN type = 'Withdrawal' AND status = 'Completed' THEN 1 END) AS withdrawal_count
       FROM transactions
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
       GROUP BY year, week_number
       ORDER BY year ASC, week_number ASC`
    );

    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/analytics/stock-turnover ───────────────────────────────────────
// Matches SQL Query 3 — units sold per product
exports.getStockTurnover = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        se.product_variant_id,
        fp.product_name,
        pv.size_label,
        pv.price,
        SUM(se.quantity_added) AS total_added,
        SUM(se.quantity_remaining) AS total_remaining,
        SUM(se.quantity_added - se.quantity_remaining) AS units_sold,
        ROUND(
          SUM(se.quantity_added - se.quantity_remaining) /
          NULLIF(SUM(se.quantity_added), 0) * 100, 1
        ) AS turnover_rate_percent
       FROM stock_entries se
       JOIN product_variants pv ON se.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       GROUP BY se.product_variant_id, fp.product_name, pv.size_label, pv.price
       ORDER BY units_sold DESC`
    );

    res.status(200).json({ status: 'success', count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/analytics/most-demanded ────────────────────────────────────────
// Matches SQL Query 4 — most booked products
exports.getMostDemanded = async (req, res) => {
  try {
    // From inventory_allocations (actual bookings)
    const [byBookings] = await db.execute(
      `SELECT
        ia.shared_inventory_id,
        fp.product_name,
        pv.size_label,
        pv.price,
        COUNT(*) AS total_bookings,
        SUM(ia.slots_booked) AS total_slots_booked
       FROM inventory_allocations ia
       JOIN shared_inventory si ON ia.shared_inventory_id = si.id
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       GROUP BY ia.shared_inventory_id, fp.product_name, pv.size_label, pv.price
       ORDER BY total_bookings DESC
       LIMIT 10`
    );

    // From transactions — Booking_Hold type (matches SQL Query 4 exactly)
    const [byTransactions] = await db.execute(
      `SELECT
        t.product_variant_id,
        COALESCE(fp.product_name, 'Unknown') AS product_name,
        COUNT(*) AS total_bookings
       FROM transactions t
       LEFT JOIN product_variants pv ON t.product_variant_id = pv.id
       LEFT JOIN food_products fp ON pv.product_id = fp.id
       WHERE t.type = 'Booking_Hold'
       GROUP BY t.product_variant_id, product_name
       ORDER BY total_bookings DESC`
    );

    res.status(200).json({
      status: 'success',
      data: {
        by_bookings: byBookings,
        by_transaction_holds: byTransactions
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/analytics/dispute-patterns ─────────────────────────────────────
// Matches SQL Query 5 — users with 3+ failed transactions
exports.getDisputePatterns = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        t.user_id,
        u.first_name, u.last_name, u.email, u.phone,
        COUNT(*) AS failed_transactions,
        MAX(t.created_at) AS last_failure
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.status = 'Failed'
       GROUP BY t.user_id, u.first_name, u.last_name, u.email, u.phone
       HAVING failed_transactions > 2
       ORDER BY failed_transactions DESC`
    );

    res.status(200).json({ status: 'success', count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── GET /api/analytics/overview ─────────────────────────────────────────────
// Alias — same as financial-summary but lighter, for dashboard stat cards only
exports.getOverview = async (req, res) => {
  try {
    const [[revenue]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions WHERE type = 'Deposit' AND status = 'Completed'`
    );
    const [[withdrawals]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions WHERE type = 'Withdrawal' AND status = 'Completed'`
    );
    const [[customers]] = await db.execute(
      `SELECT COUNT(*) AS total FROM users WHERE account_type = 'Customer'`
    );
    const [[bookings]] = await db.execute(
      `SELECT COUNT(*) AS total FROM inventory_allocations`
    );
    const [[pendingTx]] = await db.execute(
      `SELECT COUNT(*) AS total FROM transactions WHERE status = 'Pending'`
    );

    res.status(200).json({
      status: 'success',
      data: {
        total_revenue: parseFloat(revenue.total),
        total_withdrawals: parseFloat(withdrawals.total),
        net: parseFloat(revenue.total) - parseFloat(withdrawals.total),
        total_customers: customers.total,
        total_bookings: bookings.total,
        pending_transactions: pendingTx.total
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};