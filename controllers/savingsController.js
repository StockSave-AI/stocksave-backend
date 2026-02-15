const db = require('../configs/connect');

exports.addSavings = async (req, res) => {
  // 1. Destructure and validate
  const { user_id, amount, method, reference } = req.body;

  // Prevent "undefined" error by checking values before SQL runs
  if (!user_id || !amount || !method || !reference) {
    return res.status(400).json({ 
      error: "Missing fields. Ensure user_id, amount, method, and reference are sent." 
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction(); 

    // 2. Log the transaction 
    // Ensure 'method' matches ENUM: 'Cash', 'Paystack', or 'Transfer'
    const [logResult] = await connection.execute(
      `INSERT INTO transactions (user_id, amount, type, method, reference, status) 
       VALUES (?, ?, 'Deposit', ?, ?, 'Completed')`,
      [user_id, amount, method, reference]
    );

    // 3. Update the user's running balance
    // Ensure you ran the ALTER TABLE command mentioned above!
    const [userUpdate] = await connection.execute(
      `UPDATE users SET balance = balance + ? WHERE id = ?`,
      [amount, user_id]
    );

    
    if (userUpdate.affectedRows === 0) {
      throw new Error("User not found");
    }

    await connection.commit(); 
    res.status(200).json({ 
      success: true,
      message: "Savings updated successfully", 
      transactionId: logResult.insertId 
    });

  } catch (error) {
    await connection.rollback(); 
    res.status(500).json({ error: "Transaction failed: " + error.message });
  } finally {
    connection.release();
  }
};


exports.getHistory = async (req, res) => {
  const { userId } = req.params; 
  
  // LOG THIS: See exactly what the backend thinks the ID is
  //console.log("DEBUG: userId from params is:", userId);
  //console.log("DEBUG: Type of userId is:", typeof userId);

  try {
    // Try forcing the ID to a Number just in case
    const [rows] = await db.execute(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC',
      [Number(userId)] 
    );
    
    console.log("DEBUG: Rows found in DB:", rows.length);
    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error("SQL Error:", error);
    res.status(500).json({ error: error.message });
  }
};
