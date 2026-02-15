const db = require('../configs/connect');

const User = {
  // FIND BY EMAIL: Used for Login
  findByEmail: async (email) => {
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    return rows[0];
  },

  // FIND BY PHONE: Used for OTP/Password Reset
  findByPhone: async (phone) => {
    const [rows] = await db.execute("SELECT * FROM users WHERE phone = ?", [phone]);
    return rows[0]; // Simplified to return the single user object
  },

  // NEW - FIND BY ID: Used for the Profile Summary (/profile)
  
  findById: async (id) => {
    const [rows] = await db.execute(
      "SELECT id, full_name, email, phone, account_type, balance, created_at FROM users WHERE id = ?", 
      [id]
    );
    return rows[0];
  },

  // CREATE USER: Including balance (defaults to 0.00)
  createUser: async (data) => {
    const query = `
      INSERT INTO users 
      (full_name, email, phone, password_hash, account_type, balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.execute(query, [
      data.full_name, data.email, data.phone, data.password_hash,
      data.account_type, 
      data.balance || 0.00
    ]);
    return { id: result.insertId, ...data };
  },

  // UPDATE PASSWORD
  updatePassword: async (phone, newPasswordHash) => {
    return await db.execute(
      "UPDATE users SET password_hash = ? WHERE phone = ?",
      [newPasswordHash, phone]
    );
  },

  // DELETE ACCOUNT: Matches the "Deactivate Account" functionality
  deleteById: async (id) => {
    return await db.execute("DELETE FROM users WHERE id = ?", [id]);
  }
};

module.exports = User;