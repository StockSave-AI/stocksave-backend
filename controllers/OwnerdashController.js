const db = require('../configs/connect');

// GET /api/owner/stats
exports.getDashboardStats = async (req, res) => {
  try {
    const [[users]] = await db.execute(
      `SELECT COUNT(*) AS total, SUM(status = 'Active') AS active FROM users WHERE account_type = 'Customer'`
    );
    const [[deposits]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'Deposit' AND status = 'Completed'`
    );
    const [[withdrawals]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'Withdrawal' AND status = 'Completed'`
    );
    const [[pending]] = await db.execute(
      `SELECT COUNT(*) AS total FROM transactions WHERE status = 'Pending'`
    );
    const [[bookings]] = await db.execute(
      `SELECT COUNT(*) AS total FROM inventory_allocations`
    );

    res.status(200).json({
      status: 'success',
      data: {
        total_users: users.total,
        active_users: users.active,
        total_deposits: deposits.total,
        total_withdrawals: withdrawals.total,
        pending_transactions: pending.total,
        total_bookings: bookings.total
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/owner/users - All customers with transactions and pagination
exports.getAllUsers = async (req, res) => {
  const { q, status, page = 1, limit = 20, include_transactions } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Build dynamic query
    let where = `WHERE account_type = 'Customer'`;
    const params = [];

    if (q) {
      where += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status) {
      where += ` AND status = ?`;
      params.push(status);
    }

    // Total count for pagination
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM users ${where}`, params
    );

    // Fetch users
    const [users] = await db.execute(
      `SELECT id, first_name, last_name, email, phone, status, balance, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Optionally attach transactions for each user
    let usersWithTransactions = users;
    if (include_transactions === 'true' && users.length > 0) {
      const userIds = users.map(u => u.id);
      const placeholders = userIds.map(() => '?').join(',');

      const [transactions] = await db.execute(
        `SELECT id, user_id, amount, type, method, status, reference, created_at
         FROM transactions
         WHERE user_id IN (${placeholders})
         ORDER BY created_at DESC`,
        userIds
      );

      usersWithTransactions = users.map(u => ({
        ...u,
        transactions: transactions.filter(t => t.user_id === u.id)
      }));
    } else if (include_transactions === 'true' && users.length === 0) {
      // No users found - return empty array safely
      usersWithTransactions = [];
    }

    res.status(200).json({
      status: 'success',
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / parseInt(limit))
      },
      users: usersWithTransactions
    });
  } catch (error) {
    console.error('getAllUsers error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/owner/users/:id - Single customer with full transaction history
exports.getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const [users] = await db.execute(
      `SELECT id, first_name, last_name, email, phone, status, balance, created_at
       FROM users WHERE id = ? AND account_type = 'Customer'`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const user = users[0];

    const [transactions] = await db.execute(
      `SELECT id, amount, type, method, status, reference, created_at
       FROM transactions WHERE user_id = ?
       ORDER BY created_at DESC`,
      [id]
    );

    const [bookings] = await db.execute(
      `SELECT ia.id, ia.slots_booked, ia.created_at,
              fp.product_name, pv.size_label, pv.price,
              (ia.slots_booked * pv.price) AS total_cost
       FROM inventory_allocations ia
       JOIN shared_inventory si ON ia.shared_inventory_id = si.id
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       WHERE ia.user_id = ?
       ORDER BY ia.created_at DESC`,
      [id]
    );

    res.status(200).json({
      status: 'success',
      data: { ...user, transactions, bookings }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/owner/search-users
exports.searchUsers = async (req, res) => {
  const { q, status, account_type } = req.query;
  try {
    let query = `SELECT id, first_name, last_name, email, phone,
                        account_type, status, balance, created_at
                 FROM users WHERE 1=1`;
    const params = [];

    if (q) {
      query += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status)       { query += ` AND status = ?`;       params.push(status); }
    if (account_type) { query += ` AND account_type = ?`; params.push(account_type); }

    query += ` ORDER BY created_at DESC`;

    const [rows] = await db.execute(query, params);
    res.status(200).json({ status: 'success', count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/owner/recent-cash
exports.getRecentCashDeposits = async (req, res) => {
  const txStatus = req.query.status || 'Pending';
  const limit = parseInt(req.query.limit) || 10;
  try {
    const [rows] = await db.execute(
      `SELECT t.id, t.amount, t.status, t.reference, t.created_at,
              u.id AS user_id, u.first_name, u.last_name, u.phone
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.method = 'Cash' AND t.status = ?
       ORDER BY t.created_at DESC
       LIMIT ?`,
      [txStatus, limit]
    );
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/owner/record-deposit
exports.recordCashDeposit = async (req, res) => {
  const { userId, amount, reference } = req.body;
  if (!userId || !amount) {
    return res.status(400).json({ message: 'userId and amount are required' });
  }

  try {
    const [user] = await db.execute(
      `SELECT id FROM users WHERE id = ? AND account_type = 'Customer'`, [userId]
    );
    if (user.length === 0) return res.status(404).json({ message: 'Customer not found' });

    const trxRef = reference || `CASH-${Date.now()}`;
    const [result] = await db.execute(
      `INSERT INTO transactions (user_id, amount, type, method, status, reference)
       VALUES (?, ?, 'Deposit', 'Cash', 'Pending', ?)`,
      [userId, amount, trxRef]
    );

    res.status(201).json({
      status: 'success',
      message: 'Cash deposit recorded',
      data: { transaction_id: result.insertId, amount, status: 'Pending' }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// PATCH /api/owner/complete-withdrawal
exports.completeWithdrawal = async (req, res) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ message: 'transactionId is required' });
  }
  try {
    const [result] = await db.execute(
      `UPDATE transactions SET status = 'Completed'
       WHERE id = ? AND type = 'Withdrawal' AND status IN ('Pending', 'Processing')`,
      [transactionId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Withdrawal not found or already completed' });
    }
    res.status(200).json({ status: 'success', message: 'Withdrawal marked as completed' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/owner/withdrawals
exports.getPendingWithdrawals = async (req, res) => {
  const txStatus = req.query.status || 'Processing';
  try {
    const [rows] = await db.execute(
      `SELECT t.id, t.amount, t.status, t.reference, t.created_at,
              u.id AS user_id, u.first_name, u.last_name, u.email, u.phone
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.type = 'Withdrawal' AND t.status = ?
       ORDER BY t.created_at DESC`,
      [txStatus]
    );
    res.status(200).json({ status: 'success', count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/owner/transactions
exports.getAllTransactions = async (req, res) => {
  const { type, status, method, limit = 50 } = req.query;
  try {
    let query = `SELECT t.id, t.amount, t.type, t.method, t.status,
                        t.reference, t.created_at,
                        u.id AS user_id, u.first_name, u.last_name, u.email, u.phone
                 FROM transactions t
                 JOIN users u ON t.user_id = u.id
                 WHERE 1=1`;
    const params = [];

    if (type)   { query += ` AND t.type = ?`;   params.push(type); }
    if (status) { query += ` AND t.status = ?`; params.push(status); }
    if (method) { query += ` AND t.method = ?`; params.push(method); }

    query += ` ORDER BY t.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));

    const [rows] = await db.execute(query, params);
    res.status(200).json({ status: 'success', count: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};