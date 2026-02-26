const db = require('../configs/connect');

exports.getCustomerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. GET CORE PROFILE & BALANCE
    const [user] = await db.execute(
      "SELECT first_name, last_name, email, phone, account_type, status, balance, created_at FROM users WHERE id = ?",
      [userId]
    );
    if (!user[0]) return res.status(404).json({ message: "User not found" });

    // 2. GET ACTIVE PAYMENT PLAN - full data from payment_plans table
    const [plan] = await db.execute(
      `SELECT id, plan_type, amount, next_payment_date, duration,
              payments_made, payments_missed, target_amount, start_date, end_date
       FROM payment_plans 
       WHERE user_id = ? AND status = 'Active' 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    // 3. GET STOCK ITEMS COUNT
    /*const [stock] = await db.execute(
      "SELECT COUNT(*) as totalItems FROM stock_items WHERE is_available = TRUE"
    );*/

    // 4. GET RECENT ACTIVITY (Last 4 transactions)
    const [transactions] = await db.execute(
      "SELECT type, amount, method, status, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 4",
      [userId]
    );

    // 5. CALCULATE PROGRESS using plan's target_amount if available
    const balance = parseFloat(user[0].balance) || 0;
    const activePlan = plan[0] || null;

    // Monthly progress - based on plan amount if plan exists
    const monthlyGoal = activePlan ? parseFloat(activePlan.amount) * 12 : 20000;
    const annualGoal = activePlan
      ? parseFloat(activePlan.target_amount) || parseFloat(activePlan.amount) * activePlan.duration
      : 240000;

    // Plan progress stats
    const totalPayments = activePlan?.duration || 0;
    const paymentsMade = activePlan?.payments_made || 0;
    const paymentsMissed = activePlan?.payments_missed || 0;
    const paymentsRemaining = totalPayments - paymentsMade;
    const onTimePercent = paymentsMade > 0
      ? Math.round(((paymentsMade - paymentsMissed) / paymentsMade) * 100)
      : 100;

    res.status(200).json({
      status: 'success',
      data: {
        // Profile block
        profile: {
          id: userId,
          first_name: user[0].first_name,
          last_name: user[0].last_name,
          email: user[0].email,
          phone: user[0].phone,
          account_type: user[0].account_type,
          status: user[0].status,
          member_since: user[0].created_at
        },

        // Top greeting
        greeting: `Welcome Back, ${user[0].first_name}!`,

        // Summary cards
        summary_cards: {
          total_savings: balance,
          active_plan: activePlan ? {
            id: activePlan.id,
            plan_type: activePlan.plan_type,
            amount: activePlan.amount,
            start_date: activePlan.start_date,
            end_date: activePlan.end_date,
          } : { plan_type: 'None', amount: 0 },
          next_payment: activePlan?.next_payment_date || 'N/A',
          stock_count: 0 //stock[0].totalItems
        },

        // Plan progress (payments made/remaining/missed)
        plan_progress: activePlan ? {
          payments_made: paymentsMade,
          total_payments: totalPayments,
          payments_remaining: paymentsRemaining,
          payments_missed: paymentsMissed,
          on_time_percentage: onTimePercent
        } : null,

        // Savings progress bars
        progress: {
          monthly: {
            current: balance,
            goal: monthlyGoal,
            percentage: parseFloat(Math.min((balance / monthlyGoal) * 100, 100).toFixed(1))
          },
          annual: {
            current: balance,
            goal: annualGoal,
            percentage: parseFloat(Math.min((balance / annualGoal) * 100, 100).toFixed(1))
          }
        },

        // Recent transactions
        recent_activity: transactions
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'Dashboard data sync failed' });
  }
};

// Stub routes - uncomment and build as needed
exports.managePlans = (req, res) => res.json({ status: 'success', message: 'Use GET /api/plans for full plan data' });
exports.getSettings = (req, res) => res.json({ status: 'success', message: 'Settings coming soon' });