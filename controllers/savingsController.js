const db = require('../configs/connect');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// POST /api/savings/deposit
exports.addSavings = async (req, res) => {
  const { amount, method, reference } = req.body;
  const user_id = req.user.id;
  const email = req.user.email;

  const validMethods = ['Cash', 'Paystack', 'Transfer'];
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (!validMethods.includes(method)) return res.status(400).json({ error: 'Invalid method' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const trxRef = reference || `STK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await connection.execute(
      `INSERT INTO transactions (user_id, amount, type, method, reference, status)
       VALUES (?, ?, 'Deposit', ?, ?, 'Pending')`,
      [user_id, amount, method, trxRef]
    );

    if (method === 'Paystack') {
      const paystackResponse = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email,
          amount: Math.round(amount * 100),
          callback_url: process.env.PAYSTACK_CALLBACK_URL || 'https://auth-signup.onrender.com/api/savings/verify',
          reference: trxRef
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET.trim()}`,
            'Content-Type': 'application/json'
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
    return res.status(201).json({
      success: true,
      message: 'Deposit recorded. Awaiting confirmation.',
      reference: trxRef
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  } finally {
    connection.release();
  }
};

// ─── VERIFY ──────────────────────────────────────────────────────────────────

// GET /api/savings/verify - Paystack redirects here after payment
exports.verifyPaystackPayment = async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: 'No reference provided' });

  const connection = await db.getConnection();
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET.trim()}` } }
    );

    const FRONTEND = process.env.FRONTEND_URL || 'https://stocksave.vercel.app';

    if (response.data.data.status === 'success') {
      await connection.beginTransaction();

      const [rows] = await connection.execute(
        'SELECT status, user_id, amount FROM transactions WHERE reference = ? FOR UPDATE',
        [reference]
      );

      if (rows.length > 0 && rows[0].status === 'Pending') {
        const amount = parseFloat(rows[0].amount);
        await connection.execute(
          "UPDATE transactions SET status = 'Completed' WHERE reference = ?", [reference]
        );
        await connection.execute(
          'UPDATE users SET balance = balance + ? WHERE id = ?',
          [amount, rows[0].user_id]
        );
        await connection.commit();
        return res.redirect(`${FRONTEND}/dashboard?payment=success&reference=${reference}`);
      }

      return res.redirect(`${FRONTEND}/dashboard?payment=already_processed`);
    }

    res.redirect(`${FRONTEND}/dashboard?payment=failed`);
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// POST /api/savings/webhook
exports.handlePaystackWebhook = async (req, res) => {
  const event = req.body;
  console.log('Webhook received:', event.event);

  // Always respond 200 immediately so Paystack knows we received it
  res.sendStatus(200);

  try {
    // Transfer completed successfully
    if (event.event === 'transfer.success') {
      const reference = event.data?.reference;
      if (!reference) return;

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          `SELECT id, user_id FROM transactions 
           WHERE reference = ? AND type = 'Withdrawal' AND status IN ('Pending', 'Processing')`,
          [reference]
        );
        if (rows.length > 0) {
          await connection.execute(
            "UPDATE transactions SET status = 'Completed' WHERE reference = ?",
            [reference]
          );
          await connection.commit();
          console.log(`Withdrawal ${reference} marked Completed`);
        }
      } catch (err) {
        await connection.rollback();
        console.error('Webhook DB error:', err.message);
      } finally {
        connection.release();
      }
    }

    // Transfer failed - refund the customer
    if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      const reference = event.data?.reference;
      const amount = event.data?.amount / 100; // convert from kobo
      if (!reference) return;

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          `SELECT id, user_id, amount FROM transactions
           WHERE reference = ? AND type = 'Withdrawal' AND status IN ('Pending', 'Processing')`,
          [reference]
        );
        if (rows.length > 0) {
          // Mark failed
          await connection.execute(
            "UPDATE transactions SET status = 'Failed' WHERE reference = ?",
            [reference]
          );
          // Refund balance back to user
          await connection.execute(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [rows[0].amount, rows[0].user_id]
          );
          await connection.commit();
          console.log(`Withdrawal ${reference} failed - ₦${rows[0].amount} refunded to user ${rows[0].user_id}`);
        }
      } catch (err) {
        await connection.rollback();
        console.error('Webhook refund error:', err.message);
      } finally {
        connection.release();
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
  }
};


// GET /api/savings/history
exports.getSavingsHistory = async (req, res) => {
  try {
    const userId = req.user.account_type === 'Owner'
      ? (req.params.userId || req.user.id)
      : req.user.id;

    const [rows] = await db.execute(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/savings/recent
exports.getRecentDeposits = async (req, res) => {
  try {
    const isOwner = req.user.account_type === 'Owner';
    const query = isOwner
      ? 'SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5'
      : 'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5';

    const [rows] = await db.execute(query, isOwner ? [] : [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/savings/update-status (Owner only)
exports.updateDepositStatus = async (req, res) => {
  if (req.user.account_type !== 'Owner') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { transactionId, status } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT user_id, amount, status FROM transactions WHERE id = ? FOR UPDATE',
      [transactionId]
    );

    if (!rows[0] || rows[0].status !== 'Pending') {
      throw new Error('Invalid or already processed transaction');
    }

    await connection.execute(
      'UPDATE transactions SET status = ? WHERE id = ?', [status, transactionId]
    );

    if (status === 'Completed') {
      await connection.execute(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [rows[0].amount, rows[0].user_id]
      );
    }

    await connection.commit();
    res.status(200).json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};


// GET /api/savings/redeem
exports.getRedeemScreen = async (req, res) => {
  try {
    const userId = req.user.id;

    const [user] = await db.execute(
      'SELECT balance FROM users WHERE id = ?', [userId]
    );

    const [recentWithdrawals] = await db.execute(
      `SELECT amount, status, reference, created_at
       FROM transactions
       WHERE user_id = ? AND type = 'Withdrawal'
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        available_balance: parseFloat(user[0]?.balance) || 0,
        processing_time: '2-5 business days via Paystack Transfer',
        recent_withdrawals: recentWithdrawals
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/savings/banks
exports.getBankList = async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.paystack.co/bank?currency=NGN',  // ← correct endpoint
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET.trim()}` } }
    );

    res.status(200).json({
      status: 'success',
      data: response.data.data.map(bank => ({
        name: bank.name,
        code: bank.code
      }))
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/savings/withdraw
exports.submitWithdrawal = async (req, res) => {
  const userId = req.user.id;
  const { amount, account_name, account_number, bank_code } = req.body;

  if (!amount || amount < 100) {
    return res.status(400).json({ error: 'Minimum withdrawal is ₦100' });
  }
  if (!account_name || !account_number || !bank_code) {
    return res.status(400).json({ error: 'account_name, account_number and bank_code are required' });
  }

  const conn = await db.getConnection();
try {
  await conn.beginTransaction();

  const [rows] = await conn.execute(
    'SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]
  );
  const user = rows[0];

  if (!user || parseFloat(user.balance) < amount) {
    await conn.rollback();
    return res.status(400).json({ status: 'error', message: 'Insufficient balance' });
  }

  const transferRef = `WDR-${uuidv4()}`;
  let recipientCode = null;

  if (process.env.SKIP_PAYSTACK_TRANSFER !== 'true') {
    // Step 1 - Create transfer recipient
    const recipientRes = await axios.post(
      'https://api.paystack.co/transferrecipient',
      { type: 'nuban', name: account_name, account_number, bank_code, currency: 'NGN' },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET.trim()}`, 'Content-Type': 'application/json' } }
    );
    recipientCode = recipientRes.data.data.recipient_code;

    // Step 2 - Initiate transfer
    await axios.post(
      'https://api.paystack.co/transfer',
      { source: 'balance', amount: Math.round(amount * 100), recipient: recipientCode, reason: 'StockSave Withdrawal', reference: transferRef },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET.trim()}`, 'Content-Type': 'application/json' } }
    );
  }

  // Step 3 - Deduct balance and record
  await conn.execute(
    'UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]
  );
  await conn.execute(
    `INSERT INTO transactions (user_id, amount, type, method, status, reference, recipient_code)
     VALUES (?, ?, 'Withdrawal', 'Paystack', 'Completed', ?, ?)`,
    [userId, amount, transferRef, recipientCode]
  );

  await conn.commit();

  res.status(200).json({
    success: true,
    message: 'Withdrawal initiated successfully',
    data: { reference: transferRef, new_balance: parseFloat(user.balance) - amount }
  });
} catch (error) {
  await conn.rollback();
  res.status(500).json({ status: 'error', message: error.response?.data?.message || error.message });
} finally {
  conn.release();
}
};
// GET /api/savings/balance
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