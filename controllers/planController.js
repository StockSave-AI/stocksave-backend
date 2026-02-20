const db = require('../configs/connect');

// GET /api/plans - Full plan management screen data
exports.getMyPlan = async (req, res) => {
  try {
    const userId = req.user.id;

    const [plans] = await db.execute(
      `SELECT * FROM payment_plans 
       WHERE user_id = ? AND status = 'Active' 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (plans.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No active plan found',
        data: null
      });
    }

    const plan = plans[0];
    const totalPayments = plan.duration_months;
    const remaining = totalPayments - plan.payments_made;
    const onTimePercent = plan.payments_made > 0
      ? Math.round(((plan.payments_made - plan.payments_missed) / plan.payments_made) * 100)
      : 100;

    // Payment history
    const [history] = await db.execute(
      `SELECT id, amount, method, status, created_at 
       FROM transactions 
       WHERE user_id = ? AND type = 'Deposit'
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    // Upcoming payments - next 3
    const upcoming = [];
    const baseDate = new Date(plan.next_payment_date);
    const today = new Date();

    for (let i = 0; i < 3; i++) {
      const paymentDate = new Date(baseDate);
      if (plan.plan_type === 'Monthly') paymentDate.setMonth(paymentDate.getMonth() + i);
      else if (plan.plan_type === 'Weekly') paymentDate.setDate(paymentDate.getDate() + 7 * i);
      else paymentDate.setDate(paymentDate.getDate() + i);

      const daysUntil = Math.ceil((paymentDate - today) / (1000 * 60 * 60 * 24));

      upcoming.push({
        date: paymentDate.toISOString().split('T')[0],
        amount: plan.amount,
        days_until: daysUntil > 0 ? daysUntil : 0,
        label: daysUntil <= 0 ? 'Due today' : `in ${daysUntil} days`
      });
    }

    // Savings progress
    const [user] = await db.execute('SELECT balance FROM users WHERE id = ?', [userId]);
    const balance = parseFloat(user[0]?.balance) || 0;
    const target = parseFloat(plan.target_amount) || (plan.amount * plan.duration_months);
    const savedProgress = Math.min((balance / target) * 100, 100).toFixed(1);

    res.status(200).json({
      status: 'success',
      data: {
        current_plan: {
          id: plan.id,
          plan_type: plan.plan_type,
          amount: plan.amount,
          duration_months: plan.duration_months,
          start_date: plan.start_date,
          end_date: plan.end_date,
          next_payment_date: plan.next_payment_date,
          status: plan.status
        },
        progress: {
          payments_made: plan.payments_made,
          total_payments: totalPayments,
          payments_remaining: remaining,
          payments_missed: plan.payments_missed,
          on_time_percentage: onTimePercent,
          total_saved: balance,
          target_amount: target,
          saved_percentage: parseFloat(savedProgress)
        },
        payment_history: history,
        upcoming_payments: upcoming,
        settings: {
          auto_renewal: plan.auto_renewal,
          payment_reminders: plan.payment_reminders,
          auto_debit: plan.auto_debit
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/plans - Create a new plan
exports.createPlan = async (req, res) => {
  const { plan_type, amount, target_amount, duration_months, start_date } = req.body;
  const userId = req.user.id;

  if (!plan_type || !amount || !duration_months || !start_date) {
    return res.status(400).json({ message: 'plan_type, amount, duration_months and start_date are required' });
  }

  try {
    await db.execute(
      "UPDATE payment_plans SET status = 'Cancelled' WHERE user_id = ? AND status = 'Active'",
      [userId]
    );

    const start = new Date(start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(duration_months));

    const nextPayment = new Date(start);
    if (plan_type === 'Monthly') nextPayment.setMonth(nextPayment.getMonth() + 1);
    else if (plan_type === 'Weekly') nextPayment.setDate(nextPayment.getDate() + 7);
    else nextPayment.setDate(nextPayment.getDate() + 1);

    const [result] = await db.execute(
      `INSERT INTO payment_plans 
        (user_id, plan_type, amount, target_amount, duration_months, start_date, end_date, next_payment_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, plan_type, amount,
        target_amount || (amount * duration_months),
        duration_months,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        nextPayment.toISOString().split('T')[0]
      ]
    );

    res.status(201).json({
      status: 'success',
      message: `${plan_type} plan created`,
      data: { plan_id: result.insertId }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// PUT /api/plans/:id - Modify plan (amount or frequency)
exports.updatePlan = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { plan_type, amount } = req.body;

  try {
    const [existing] = await db.execute(
      'SELECT id FROM payment_plans WHERE id = ? AND user_id = ?', [id, userId]
    );
    if (existing.length === 0) return res.status(404).json({ message: 'Plan not found' });

    await db.execute(
      `UPDATE payment_plans SET 
        plan_type = COALESCE(?, plan_type),
        amount = COALESCE(?, amount),
        updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [plan_type || null, amount || null, id, userId]
    );

    res.status(200).json({ status: 'success', message: 'Plan updated' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/plans/:id/pause
exports.pausePlan = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const [result] = await db.execute(
      "UPDATE payment_plans SET status = 'Paused' WHERE id = ? AND user_id = ? AND status = 'Active'",
      [id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Active plan not found' });
    res.status(200).json({ status: 'success', message: 'Plan paused' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// POST /api/plans/:id/resume
exports.resumePlan = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const [result] = await db.execute(
      "UPDATE payment_plans SET status = 'Active' WHERE id = ? AND user_id = ? AND status = 'Paused'",
      [id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Paused plan not found' });
    res.status(200).json({ status: 'success', message: 'Plan resumed' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// PATCH /api/plans/:id/settings - Toggle auto-renewal, reminders, auto-debit
exports.updateSettings = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { auto_renewal, payment_reminders, auto_debit } = req.body;

  try {
    await db.execute(
      `UPDATE payment_plans SET 
        auto_renewal = COALESCE(?, auto_renewal),
        payment_reminders = COALESCE(?, payment_reminders),
        auto_debit = COALESCE(?, auto_debit)
       WHERE id = ? AND user_id = ?`,
      [auto_renewal ?? null, payment_reminders ?? null, auto_debit ?? null, id, userId]
    );
    res.status(200).json({ status: 'success', message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// DELETE /api/plans/:id - Cancel plan
exports.cancelPlan = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const [result] = await db.execute(
      "UPDATE payment_plans SET status = 'Cancelled' WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Plan not found' });
    res.status(200).json({ status: 'success', message: 'Plan cancelled' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};