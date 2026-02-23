const db = require('../configs/connect');

// GET /api/inventory - Full stock board
exports.getStockBoard = async (req, res) => {
  try {
    const [items] = await db.execute(
      `SELECT 
        si.id AS inventory_id,
        fc.category_name,
        fp.product_name,
        fp.image_url,
        pv.size_label,
        pv.price,
        si.total_slots,
        si.slots_remaining,
        si.status,
        si.created_at
       FROM shared_inventory si
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       JOIN food_categories fc ON fp.category_id = fc.id
       WHERE si.status = 'open'
       ORDER BY fc.category_name, fp.product_name`
    );

    const [alerts] = await db.execute(
      `SELECT fp.product_name, pv.size_label, si.slots_remaining
       FROM shared_inventory si
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       WHERE si.slots_remaining < 10 AND si.status = 'open'`
    );

    res.status(200).json({
      status: 'success',
      data: { total_items: items.length, items, low_stock_alerts: alerts }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/inventory/categories - Food dropdown
exports.getCategories = async (req, res) => {
  try {
    const [categories] = await db.execute(
      'SELECT * FROM food_categories ORDER BY category_name'
    );

    const [products] = await db.execute(
      `SELECT fp.id, fp.category_id, fp.product_name, fp.image_url,
              pv.id AS variant_id, pv.size_label, pv.price, pv.stock_quantity
       FROM food_products fp
       LEFT JOIN product_variants pv ON fp.id = pv.product_id
       ORDER BY fp.product_name`
    );

    const result = categories.map(cat => ({
      ...cat,
      products: products
        .filter(p => p.category_id === cat.id)
        .reduce((acc, p) => {
          const existing = acc.find(x => x.id === p.id);
          if (existing) {
            existing.variants.push({
              variant_id: p.variant_id,
              size_label: p.size_label,
              price: p.price,
              stock_quantity: p.stock_quantity
            });
          } else {
            acc.push({
              id: p.id,
              product_name: p.product_name,
              image_url: p.image_url,
              variants: p.variant_id ? [{
                variant_id: p.variant_id,
                size_label: p.size_label,
                price: p.price,
                stock_quantity: p.stock_quantity
              }] : []
            });
          }
          return acc;
        }, [])
    }));

    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/inventory/:id - Single item
exports.getInventoryItem = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT si.*, pv.size_label, pv.price,
              fp.product_name, fp.image_url, fc.category_name
       FROM shared_inventory si
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       JOIN food_categories fc ON fp.category_id = fc.id
       WHERE si.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Item not found' });
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/inventory/book - Book food slots with FIFO stock reduction
exports.bookFoodItem = async (req, res) => {
  const userId = req.user.id;
  const { inventory_id, slots_booked } = req.body;

  if (!inventory_id || !slots_booked || slots_booked <= 0) {
    return res.status(400).json({ message: 'inventory_id and slots_booked are required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Lock inventory row - prevent overbooking
    const [invRows] = await connection.execute(
      `SELECT si.*, pv.price, pv.id AS variant_id
       FROM shared_inventory si
       JOIN product_variants pv ON si.product_variant_id = pv.id
       WHERE si.id = ? AND si.status = 'open'
       FOR UPDATE`,
      [inventory_id]
    );

    if (invRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Inventory not found or closed' });
    }

    const item = invRows[0];

    // 2. Lock user row - check balance
    const [userRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]
    );
    const user = userRows[0];
    const totalCost = slots_booked * item.price;

    // 3. Validate slots and balance
    if (item.slots_remaining < slots_booked) {
      await connection.rollback();
      return res.status(400).json({ message: `Only ${item.slots_remaining} slots available` });
    }
    if (parseFloat(user.balance) < totalCost) {
      await connection.rollback();
      return res.status(400).json({
        message: `Insufficient balance. Need ₦${totalCost}, have ₦${user.balance}`
      });
    }

    // 4. FIFO - check enough stock exists across all batches
    const [stockBatches] = await connection.execute(
      `SELECT id, quantity_remaining
       FROM stock_entries
       WHERE product_variant_id = ? AND quantity_remaining > 0
       ORDER BY date_added ASC`,
      [item.variant_id]
    );

    const totalFifoStock = stockBatches.reduce((sum, b) => sum + b.quantity_remaining, 0);
    if (totalFifoStock < slots_booked) {
      await connection.rollback();
      return res.status(400).json({ message: 'Not enough physical stock available' });
    }

    // 5. FIFO - deduct from oldest batches first
    let remaining = slots_booked;
    for (const batch of stockBatches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.quantity_remaining, remaining);
      await connection.execute(
        `UPDATE stock_entries
         SET quantity_remaining = quantity_remaining - ?
         WHERE id = ?`,
        [deduct, batch.id]
      );
      remaining -= deduct;
    }

    // 6. Deduct slots from shared_inventory
    await connection.execute(
      'UPDATE shared_inventory SET slots_remaining = slots_remaining - ? WHERE id = ?',
      [slots_booked, inventory_id]
    );

    // 7. Mark inventory as completed if fully booked
    await connection.execute(
      `UPDATE shared_inventory SET status = 'completed'
       WHERE id = ? AND slots_remaining = 0`,
      [inventory_id]
    );

    // 8. Deduct user balance
    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [totalCost, userId]
    );

    // 9. Record booking in inventory_allocations
    await connection.execute(
      'INSERT INTO inventory_allocations (user_id, shared_inventory_id, slots_booked) VALUES (?, ?, ?)',
      [userId, inventory_id, slots_booked]
    );

    // 10. Record transaction
    await connection.execute(
      `INSERT INTO transactions (user_id, amount, type, method, status)
       VALUES (?, ?, 'Booking_Hold', 'Paystack', 'Completed')`,
      [userId, totalCost]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Slot booked successfully',
      data: {
        slots_booked,
        total_cost: totalCost,
        stock_batches_used: slots_booked - remaining
      }
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ status: 'error', message: error.message });
  } finally {
    connection.release();
  }
};

// GET /api/inventory/my-bookings
exports.getMyBookings = async (req, res) => {
  const userId = req.user.id;
  try {
    const [bookings] = await db.execute(
      `SELECT 
        ia.id, ia.slots_booked, ia.created_at,
        fp.product_name, fp.image_url, pv.size_label, pv.price,
        fc.category_name,
        (ia.slots_booked * pv.price) AS total_cost
       FROM inventory_allocations ia
       JOIN shared_inventory si ON ia.shared_inventory_id = si.id
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       JOIN food_categories fc ON fp.category_id = fc.id
       WHERE ia.user_id = ?
       ORDER BY ia.created_at DESC`,
      [userId]
    );
    res.status(200).json({ status: 'success', data: bookings });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/inventory/all-bookings - Owner only
exports.getAllBookings = async (req, res) => {
  try {
    const [bookings] = await db.execute(
      `SELECT 
        ia.id, ia.slots_booked, ia.created_at,
        u.first_name, u.last_name, u.email,
        fp.product_name, pv.size_label, pv.price,
        (ia.slots_booked * pv.price) AS total_cost
       FROM inventory_allocations ia
       JOIN users u ON ia.user_id = u.id
       JOIN shared_inventory si ON ia.shared_inventory_id = si.id
       JOIN product_variants pv ON si.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       ORDER BY ia.created_at DESC`
    );
    res.status(200).json({ status: 'success', data: bookings });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/inventory/add - Owner only
exports.addInventory = async (req, res) => {
  const { product_variant_id, total_slots } = req.body;

  if (!product_variant_id || !total_slots) {
    return res.status(400).json({ message: 'product_variant_id and total_slots are required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Add to shared inventory pool
    const [result] = await connection.execute(
      `INSERT INTO shared_inventory (product_variant_id, total_slots, slots_remaining)
       VALUES (?, ?, ?)`,
      [product_variant_id, total_slots, total_slots]
    );

    // Create FIFO stock entry batch
    await connection.execute(
      `INSERT INTO stock_entries (product_variant_id, quantity_added, quantity_remaining)
       VALUES (?, ?, ?)`,
      [product_variant_id, total_slots, total_slots]
    );

    await connection.commit();

    res.status(201).json({
      status: 'success',
      message: 'Inventory added',
      data: {
        inventory_id: result.insertId,
        product_variant_id,
        total_slots,
        note: 'Stock entry created for FIFO tracking'
      }
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ status: 'error', message: error.message });
  } finally {
    connection.release();
  }
};

// GET /api/inventory/stock-batches/:variantId - Owner: view FIFO batches
exports.getStockBatches = async (req, res) => {
  const { variantId } = req.params;
  try {
    const [batches] = await db.execute(
      `SELECT se.id, se.quantity_added, se.quantity_remaining, se.date_added,
              fp.product_name, pv.size_label
       FROM stock_entries se
       JOIN product_variants pv ON se.product_variant_id = pv.id
       JOIN food_products fp ON pv.product_id = fp.id
       WHERE se.product_variant_id = ?
       ORDER BY se.date_added ASC`,
      [variantId]
    );

    const totalRemaining = batches.reduce((sum, b) => sum + b.quantity_remaining, 0);

    res.status(200).json({
      status: 'success',
      data: {
        total_remaining: totalRemaining,
        batch_count: batches.length,
        batches
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};