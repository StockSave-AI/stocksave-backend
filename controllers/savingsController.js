const db = require('../configs/connect');
const axios = require('axios');

// 1. ADD SAVINGS
exports.addSavings = async (req, res) => {
  const { amount, method, reference } = req.body;
  const user_id = req.user.id;
  const email = req.user.email;

  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
  if (!['Cash', 'Paystack', 'Transfer'].includes(method)) return res.status(400).json({ error: "Invalid method" });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const trxRef = reference || `STK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await connection.execute(
      `INSERT INTO transactions (user_id, amount, type, method, reference, status) 
       VALUES (?, ?, 'Deposit', ?, ?, 'Pending')`,
      [user_id, amount, method, trxRef]
    );

    if (method === "Paystack") {
      const paystackResponse = await axios.post(
        "https://api.paystack.co",
        { email, amount: Math.round(amount * 100), callback_url: "http://localhost:3000/api/savings/verify", reference: trxRef },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }}
      );
      await connection.commit();
      return res.status(200).json({ success: true, payment_url: paystackResponse.data.data.authorization_url, reference: trxRef });
    }

    await connection.commit();
    return res.status(201).json({ success: true, message: "Deposit recorded. Awaiting confirmation." });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally { if (connection) connection.release(); }
};

// 2. VERIFY PAYSTACK
exports.verifyPaystackPayment = async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: "No reference provided" });

  const connection = await db.getConnection();
  try {
    const response = await axios.get(
      `https://api.paystack.co{reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    if (response.data.data.status === 'success') {
      await connection.beginTransaction();
      const [rows] = await connection.execute("SELECT status, user_id, amount FROM transactions WHERE reference = ? FOR UPDATE", [reference]);

      if (rows.length > 0 && rows[0].status === 'Pending') {
        await connection.execute("UPDATE transactions SET status = 'Completed' WHERE reference = ?", [reference]);
        await connection.execute("UPDATE users SET balance = balance + ? WHERE id = ?", [rows[0].amount, rows[0].user_id]);
        await connection.commit();
        return res.status(200).json({ success: true, message: "Payment verified" });
      }
      return res.status(200).json({ success: true, message: "Already processed" });
    }
    res.status(400).json({ error: "Payment failed" });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally { if (connection) connection.release(); }
};

// 3. GET HISTORY
exports.getSavingsHistory = async (req, res) => {
  try {
    const userId = req.user.account_type === 'Owner' ? req.params.userId : req.user.id;
    const [rows] = await db.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// 4. GET RECENT
exports.getRecentDeposits = async (req, res) => {
  try {
    const query = req.user.account_type === 'Owner' 
      ? "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5"
      : "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5";
    const [rows] = await db.execute(query, req.user.account_type === 'Owner' ? [] : [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// 5. UPDATE STATUS
exports.updateDepositStatus = async (req, res) => {
  if (req.user.account_type !== 'Owner') return res.status(403).json({ error: "Unauthorized" });
  const { transactionId, status } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT user_id, amount, status FROM transactions WHERE id = ? FOR UPDATE", [transactionId]);
    if (rows.length === 0 || rows[0].status !== 'Pending') throw new Error("Invalid Transaction");

    await connection.execute("UPDATE transactions SET status = ? WHERE id = ?", [status, transactionId]);
    if (status === 'Completed') {
      await connection.execute("UPDATE users SET balance = balance + ? WHERE id = ?", [rows[0].amount, rows[0].user_id]);
    }
    await connection.commit();
    res.status(200).json({ success: true, message: `Transaction ${status}` });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally { connection.release(); }
};
