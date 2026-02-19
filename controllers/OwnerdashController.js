const db = require('../configs/connect');


exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Total System Savings (Uses your 'balance' column)
    const [balanceRows] = await db.execute("SELECT SUM(balance) as total_savings FROM users");
    
    // 2. Pending Cash (Matches your 'transactions' table status/method ENUMs)
    const [pendingRows] = await db.execute(
      "SELECT COUNT(*) as count, SUM(amount) as value FROM transactions WHERE status = 'Pending' AND method = 'Cash' AND type = 'Deposit'"
    );

    // 3. Total Active Users (Uses your newly added 'status' column)
    const [userRows] = await db.execute("SELECT COUNT(*) as total_users FROM users WHERE status = 'Active'");

    res.json({
      success: true,
      stats: {
        totalSavings: balanceRows[0].total_savings || 0,
        pendingCashCount: pendingRows[0].count || 0,
        pendingCashValue: pendingRows[0].value || 0,
        totalCustomers: userRows[0].total_users || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


exports.searchUsers = async (req, res) => {
  const { query } = req.query;
  try {
    // We only search for 'Active' users per your status ENUM
    const [users] = await db.execute(
      "SELECT id, first_name, last_name, phone, balance FROM users WHERE (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?) AND status = 'Active' LIMIT 5",
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST Record Cash Deposit
 * Correctly uses transactions table columns and handles balance updates
 */
exports.recordCashDeposit = async (req, res) => {
  const { customerId, amount } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update the User's balance in the users table
    await connection.execute(
      "UPDATE users SET balance = balance + ? WHERE id = ?",
      [amount, customerId]
    );

    // 2. Insert into transactions table matching your specific ENUMs
    // Type: 'Deposit', Method: 'Cash', Status: 'Completed'
    const reference = `CASH-MANUAL-${Date.now()}`;
    await connection.execute(
      `INSERT INTO transactions (user_id, amount, type, method, reference, status) 
       VALUES (?, ?, 'Deposit', 'Cash', ?, 'Completed')`,
      [customerId, amount, reference]
    );

    await connection.commit();
    res.status(200).json({ success: true, message: "Manual cash deposit recorded." });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: "Database transaction failed." });
  } finally {
    connection.release();
  }
};

/**
 * GET Recent Cash Deposits for UI
 * Joins users and transactions to show the list in your screenshot
 */
exports.getRecentCashDeposits = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.id, t.amount, t.created_at, u.first_name, u.last_name, u.phone 
      FROM transactions t 
      JOIN users u ON t.user_id = u.id 
      WHERE t.method = 'Cash' AND t.type = 'Deposit'
      ORDER BY t.created_at DESC 
      LIMIT 3
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
