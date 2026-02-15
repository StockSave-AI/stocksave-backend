const db = require('../configs/connect');
const axios = require('axios'); 


const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

exports.requestWithdrawal = async (req, res) => {
  const { user_id, amount, account_number, bank_code } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verify User Balance (Lock row for safety)
    const [rows] = await connection.execute(
        'SELECT balance, full_name FROM users WHERE id = ? FOR UPDATE', 
        [user_id]
    );
    const user = rows[0];

    if (user.balance < amount) {
      throw new Error("Insufficient balance for withdrawal");
    }

    // 2. Deduct balance immediately (Escrow approach)
    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, user_id]
    );

    // 3. Call Paystack to Create Transfer Recipient
    const recipientResponse = await axios.post(
      'https://api.paystack.co',
      { type: "nuban", name: user.full_name, account_number, bank_code, currency: "NGN" },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const recipientCode = recipientResponse.data.data.recipient_code;

    // 4. Initiate Transfer
    const transferResponse = await axios.post(
      'https://api.paystack.co',
      { source: "balance", amount: amount * 100, recipient: recipientCode, reason: "StockSave Withdrawal" },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    // 5. Log Withdrawal
    await connection.execute(
      `INSERT INTO withdrawals (user_id, amount, account_number, transfer_code, status) 
       VALUES (?, ?, ?, ?, 'Processing')`,
      [user_id, amount, account_number, transferResponse.data.data.transfer_code]
    );

    await connection.commit();
    res.status(200).json({ message: "Withdrawal initiated successfully" });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
};
