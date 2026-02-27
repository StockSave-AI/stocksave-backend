const db = require('../configs/connect');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ⚠️ This must be defined before any function that uses it
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// ─── DEPOSITS ────────────────────────────────────────────────────────────────

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
      const FRONTEND = process.env.FRONTEND_URL || 'https://stocksave.vercel.app';
      const paystackResponse = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email,
          amount: Math.round(amount * 100),
          callback_url: `${FRONTEND}/dashboard?reference=${trxRef}&payment=success`,
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

// GET /api/savings/verify - called by frontend after Paystack redirect
exports.verifyPaystackPayment = async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ success: false, message: 'No reference provided' });

  const connection = await db.getConnection();
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET.trim()}` } }
    );

    if (response.data.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Payment was not successful',
        data: { status: response.data.data.status, reference }
      });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT status, user_id, amount FROM transactions WHERE reference = ? FOR UPDATE',
      [reference]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Transaction not found', data: { reference } });
    }

    const tx = rows[0];

    // Already processed — idempotent, return success safely
    if (tx.status === 'Completed') {
      const [[user]] = await connection.execute(
        'SELECT balance FROM users WHERE id = ?', [tx.user_id]
      );
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        data: { status: 'Completed', reference, new_balance: parseFloat(user.balance) }
      });
    }

    // First time — mark completed and credit balance
    const amount = parseFloat(tx.amount);
    await connection.execute(
      "UPDATE transactions SET status = 'Completed' WHERE reference = ?", [reference]
    );
    await connection.execute(
      'UPDATE users SET balance = balance + ? WHERE id = ?', [amount, tx.user_id]
    );

    const [[updatedUser]] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?', [tx.user_id]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        status: 'Completed',
        reference,
        amount,
        new_balance: parseFloat(updatedUser.balance)
      }
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

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

// ─── HISTORY ─────────────────────────────────────────────────────────────────

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

// ─── OWNER ────────────────────────────────────────────────────────────────────

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
      // Notify customer
      const amount = parseFloat(rows[0].amount).toLocaleString('en-NG');
      await connection.execute(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'deposit_confirmed', 'Deposit Confirmed', ?, ?, 'transaction')`,
        [rows[0].user_id, `Your deposit of ₦${amount} has been confirmed and credited to your balance.`, transactionId]
      );
    }

    if (status === 'Failed') {
      const amount = parseFloat(rows[0].amount).toLocaleString('en-NG');
      await connection.execute(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'general', 'Deposit Failed', ?, ?, 'transaction')`,
        [rows[0].user_id, `Your deposit of ₦${amount} could not be confirmed. Please contact support.`, transactionId]
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

// ─── REDEEM / WITHDRAW ────────────────────────────────────────────────────────

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

    // Deduct balance and record as Completed
    await conn.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]
    );
    await conn.execute(
      `INSERT INTO transactions (user_id, amount, type, method, status, reference)
       VALUES (?, ?, 'Withdrawal', 'Paystack', 'Completed', ?)`,
      [userId, amount, transferRef]
    );

    await conn.commit();

    // Notify all active owners about the withdrawal
    try {
      const [userInfo] = await db.execute(
        'SELECT first_name, last_name FROM users WHERE id = ?', [userId]
      );
      const [owners] = await db.execute(
        `SELECT id FROM users WHERE account_type = 'Owner' AND status = 'Active'`
      );
      if (owners.length > 0 && userInfo.length > 0) {
        const { first_name, last_name } = userInfo[0];
        const formattedAmount = parseFloat(amount).toLocaleString('en-NG');
        const values = owners.map(o =>
          `(${o.id}, 'withdrawal_alert', 'New Withdrawal Request', '${first_name} ${last_name} withdrew \u20a6${formattedAmount}. Reference: ${transferRef}.', ${userId}, 'user')`
        ).join(',');
        await db.execute(
          `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES ${values}`
        );
      }
    } catch (notifErr) {
      console.error('Withdrawal notification error:', notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Withdrawal submitted successfully',
      data: {
        reference: transferRef,
        new_balance: parseFloat(user.balance) - amount
      }
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({
      status: 'error',
      message: error.message
    });
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