const db = require('../configs/connect');

const User = {
  // Only find users who are currently 'Active'
  findByEmail: async (email) => {
    const [rows] = await db.execute(
      "SELECT * FROM users WHERE email = ? AND status = 'Active'", 
      [email]
    );
    return rows[0];
  },

  // Only find users who are currently 'Active'
  findByPhone: async (phone) => {
    const [rows] = await db.execute(
      "SELECT * FROM users WHERE phone = ? AND status = 'Active'", 
      [phone]
    );
    return rows[0];
  },

  findById: async (id) => {
    const [rows] = await db.execute(
      "SELECT id, first_name, last_name, email, phone, account_type, balance, created_at, status FROM users WHERE id = ?", 
      [id]
    );
    return rows[0];
  },

  createUser: async (data) => {
    const query = `
      INSERT INTO users 
      (first_name, last_name, email, phone, password_hash, account_type, balance, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
    `;
    const [result] = await db.execute(query, [
      data.first_name, data.last_name, data.email, data.phone, data.password_hash,
      data.account_type, data.balance || 0.00
    ]);
    return { id: result.insertId, ...data };
  },

  updatePassword: async (phone, newPasswordHash) => {
    return await db.execute(
      "UPDATE users SET password_hash = ? WHERE phone = ?",
      [newPasswordHash, phone]
    );
  },

  // Soft Delete: Updates status instead of removing the row
  deactivate: async (id) => {
    return await db.execute(
      "UPDATE users SET status = 'Deactivated' WHERE id = ?", 
      [id]
    );
  }
};

module.exports = User;
