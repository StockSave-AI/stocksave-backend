const db = require('../configs/connect');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// 1. ADD SAVINGS (Initialize Payment)
exports.addSavings = async (req, res) => {
  const { amount, method, reference } = req.body;
  const user_id = req.user.id;
  const email = req.user.email;

  const validMethods = ['Cash', 'Paystack', 'Transfer'];
  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
  if (!validMethods.includes(method)) return res.status(400).json({ error: "Invalid method" });

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
        "https://api.paystack.co/transaction/initialize", 
        { 
          email, 
          amount: Math.round(amount * 100), 
          callback_url: "https://auth-signup.onrender.com", 
          reference: trxRef 
        },
        { 
          headers: { 
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY.trim()}`,
            "Content-Type": "application/json"
          } 
        }
      );
      
      await connection.commit();
      return res.status(200).json({ 
        success: true, 
        payment_url: paystackResponse.data.data.authorization_url, 
        reference: trxRef 
      });
    }

    await connection.commit();
    return res.status(201).json({ success: true, message: "Deposit recorded. Awaiting confirmation." });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  } finally { if (connection) connection.release(); }
};

// 2. VERIFY PAYSTACK
exports.verifyPaystackPayment = async (req, res) => {
  const { reference } = req.query; 
  if (!reference) return res.status(400).json({ error: "No reference provided" });

  const connection = await db.getConnection();
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, 
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY.trim()}` } }
    );

    if (response.data.data.status === 'success') {
      await connection.beginTransaction();
      
      const [rows] = await connection.execute(
        "SELECT status, user_id, amount FROM transactions WHERE reference = ? FOR UPDATE", 
        [reference]
      );

      if (rows.length > 0 && rows[0].status === 'Pending') {
        const amount = parseFloat(rows[0].amount);
        await connection.execute("UPDATE transactions SET status = 'Completed' WHERE reference = ?", [reference]);
        await connection.execute("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, rows[0].user_id]);
        
        await connection.commit();
        return res.status(200).json({ success: true, message: "Payment verified, balance updated" });
      }
      return res.status(200).json({ success: true, message: "Already processed" });
    }
    res.status(400).json({ error: "Payment not successful on Paystack" });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally { if (connection) connection.release(); }
};

// 3. SUBMIT WITHDRAWAL
exports.submitWithdrawal = async (req, res) => {
  const userId = req.user.id;
  const { amount, account_name, account_number, bank_code } = req.body;

  if (!amount || amount < 100) return res.status(400).json({ error: "Minimum withdrawal is 100 NGN" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute('SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];

    if (!user || user.balance < amount) {
      await conn.rollback();
      return res.status(400).json({ status: "error", message: "Insufficient balance" });
    }

    // FIXED URL
    const recipientRes = await axios.post(
      'https://api.paystack.co',
      { type: "nuban", name: account_name, account_number, bank_code, currency: "NGN" },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY.trim()}` } }
    );

    const recipientCode = recipientRes.data.data.recipient_code;

    // FIXED URL
    const transferRes = await axios.post(
      'https://api.paystack.co',
      {
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: "StockSave Withdrawal"
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY.trim()}` } }
    );

    const { reference, status } = transferRes.data.data;

    await conn.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]);
    await conn.execute(
      `INSERT INTO transactions (user_id, amount, type, method, status, reference) 
       VALUES (?, ?, 'Withdrawal', 'Transfer', ?, ?)`,
      [userId, amount, status === 'otp' ? 'Pending' : 'Processing', reference]
    );

    await conn.commit();
    res.status(200).json({ success: true, message: 'Withdrawal initiated successfully', reference });

  } catch (error) {
    if (conn) await conn.rollback();
    const errorMsg = error.response?.data?.message || error.message;
    res.status(500).json({ error: errorMsg });
  } finally { if (conn) conn.release(); }
};

// 4. GET BANK LIST
exports.getBankList = async (req, res) => {
  try {
    const response = await axios.get("https://api.paystack.co", { // FIXED URL
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY.trim()}` }
    });
    res.json({ success: true, data: response.data.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 5. REMAINING FUNCTIONS
exports.getRedeemScreen = async (req, res) => {
    res.json({ success: true, message: "Redeem functionality enabled" });
};

exports.getSavingsHistory = async (req, res) => {
  try {
    const userId = req.user.account_type === 'Owner' ? (req.params.userId || req.user.id) : req.user.id;
    const [rows] = await db.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getRecentDeposits = async (req, res) => {
  try {
    const isOwner = req.user.account_type === 'Owner';
    const query = isOwner ? "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5" : "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5";
    const [rows] = await db.execute(query, isOwner ? [] : [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.updateDepositStatus = async (req, res) => {
  if (req.user.account_type !== 'Owner') return res.status(403).json({ error: "Unauthorized" });
  const { transactionId, status } = req.body; 
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT user_id, amount, status FROM transactions WHERE id = ? FOR UPDATE", [transactionId]);
    if (!rows[0] || rows[0].status !== 'Pending') throw new Error("Invalid transaction");
    await connection.execute("UPDATE transactions SET status = ? WHERE id = ?", [status, transactionId]);
    if (status === 'Completed') await connection.execute("UPDATE users SET balance = balance + ? WHERE id = ?", [rows[0].amount, rows[0].user_id]);
    await connection.commit();
    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally { if (connection) connection.release(); }
};

exports.handlePaystackWebhook = async (req, res) => {
    console.log("Webhook Received:", req.body);
    res.sendStatus(200);
};

exports.getBalance = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT balance FROM users WHERE id = ?', [req.user.id]
    );
    res.json({ status: 'success', balance: parseFloat(rows[0].balance) || 0 });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};