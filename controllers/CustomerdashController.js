const db = require('../configs/connect');

exports.getCustomerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. GET CORE PROFILE & TOTAL SAVINGS (Green Card)
    const [user] = await db.execute(
      "SELECT first_name, balance FROM users WHERE id = ?", [userId]
    );

    // 2. GET ACTIVE PAYMENT PLAN INFO (Monthly Card)
    const [plan] = await db.execute(
      "SELECT plan_type, amount, next_payment_date FROM payment_plans WHERE user_id = ? AND status = 'Active' LIMIT 1", 
      [userId]
    );

    // 3. GET STOCK ITEMS COUNT (Items Card)
    const [stock] = await db.execute(
      "SELECT COUNT(*) as totalItems FROM stock_items WHERE user_id = ?", [userId]
    );

    // 4. GET RECENT ACTIVITY (Last 4 transactions)
    const [transactions] = await db.execute(
      "SELECT type, amount, status, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 4",
      [userId]
    );

    // 5. CALCULATE SAVINGS PROGRESS (Progress Bars)
    // Note: This logic assumes you have goal columns in your DB
    const monthlyGoal = 20000; // Example static goal
    const annualGoal = 240000; 

    res.status(200).json({
      status: 'success',
      data: {
        greeting: `Welcome Back, ${user[0].first_name}!`,
        summary_cards: {
          total_savings: user[0].balance,
          active_plan: plan[0] || { plan_type: 'None', amount: 0 },
          next_payment: plan[0]?.next_payment_date || 'N/A',
          stock_count: stock[0].totalItems
        },
        progress: {
          monthly: { current: user[0].balance, goal: monthlyGoal, percentage: (user[0].balance / monthlyGoal) * 100 },
          annual: { current: user[0].balance, goal: annualGoal, percentage: (user[0].balance / annualGoal) * 100 }
        },
        recent_activity: transactions
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Dashboard data sync failed' });
  }
};

