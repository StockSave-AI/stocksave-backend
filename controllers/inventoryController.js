const db = require('../configs/connect');

exports.bookFoodItem = async (req, res) => {
  const { user_id, inventory_id, kg_booked } = req.body;
  
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the inventory row for update (Prevents overbooking)
    const [invRows] = await connection.execute(
      'SELECT * FROM inventory WHERE id = ? FOR UPDATE', [inventory_id]
    );
    const item = invRows[0];

    // 2. Lock the user row to check balance
    const [userRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE', [user_id]
    );
    const user = userRows[0];

    const totalCost = kg_booked * item.price_per_kg;

    // VALIDATION LOGIC
    if (item.remaining_kg < kg_booked) throw new Error("Not enough space in this bag!");
    if (user.balance < totalCost) throw new Error("Insufficient savings balance!");

    // 3. EXECUTE BOOKING
    // Decrease bag space
    await connection.execute(
      'UPDATE inventory SET remaining_kg = remaining_kg - ? WHERE id = ?',
      [kg_booked, inventory_id]
    );

    // Decrease user balance
    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [totalCost, user_id]
    );

    // Create booking record
    await connection.execute(
      'INSERT INTO bookings (user_id, inventory_id, kg_booked, total_cost) VALUES (?, ?, ?, ?)',
      [user_id, inventory_id, kg_booked, totalCost]
    );

    await connection.commit();
    res.status(200).json({ message: "Slot booked successfully!" });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
};
