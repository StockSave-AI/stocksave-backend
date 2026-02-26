const db = require('../configs/connect');

// ─── HELPERS ──────────────────────────────────────────────
const MIN_AMOUNTS = { Daily: 500, Weekly: 1000, Monthly: 5000 };

const calcEndDate = (startDate, planType, duration) => {
  const base = new Date(startDate);
  if (planType === 'Monthly') base.setMonth(base.getMonth() + parseInt(duration));
  else if (planType === 'Weekly') base.setDate(base.getDate() + parseInt(duration) * 7);
  else if (planType === 'Daily') base.setDate(base.getDate() + parseInt(duration));
  return base.toISOString().split('T')[0];
};

const calcNextPayment = (startDate, planType) => {
  const base = new Date(startDate);
  if (planType === 'Monthly') base.setMonth(base.getMonth() + 1);
  else if (planType === 'Weekly') base.setDate(base.getDate() + 7);
  else if (planType === 'Daily') base.setDate(base.getDate() + 1);
  return base.toISOString().split('T')[0];
};

const toDateStr = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return val.toString().split('T')[0];
};

// ─── GET /api/plans ───────────────────────────────────────
exports.getMyPlan = async (req, res) => {
  try {
    const userId = req.user.id;

    const [plans] = await db.execute(
      `SELECT * FROM payment_plans
       WHERE user_id = ? AND status IN ('Active', 'Paused')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (plans.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No active plan found', data: null });
    }

    const plan = plans[0];
    const totalPayments = plan.duration || 0;
    const remaining = totalPayments - plan.payments_made;
    const onTimePercent = plan.payments_made > 0
      ? Math.round(((plan.payments_made - plan.payments_missed) / plan.payments_made) * 100)
      : 100;

    const [history] = await db.execute(
      `SELECT id, amount, method, status, created_at
       FROM transactions WHERE user_id = ? AND type = 'Deposit'
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    // Upcoming 3 payments
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
        days_until: Math.max(daysUntil, 0),
        label: daysUntil <= 0 ? 'Due today' : `in ${daysUntil} days`
      });
    }

    const [user] = await db.execute('SELECT balance FROM users WHERE id = ?', [userId]);
    const balance = parseFloat(user[0]?.balance) || 0;
    const target = parseFloat(plan.target_amount) || (plan.amount * (plan.duration || 1));
    const savedProgress = Math.min((balance / target) * 100, 100).toFixed(1);

    res.status(200).json({
      status: 'success',
      data: {
        current_plan: {
          id: plan.id,
          plan_type: plan.plan_type,
          amount: plan.amount,
          duration: plan.duration,
          duration_unit: plan.plan_type === 'Monthly' ? 'months' : plan.plan_type === 'Weekly' ? 'weeks' : 'days',
          start_date: toDateStr(plan.start_date),
          end_date: toDateStr(plan.end_date),
          next_payment_date: toDateStr(plan.next_payment_date),
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

// ─── POST /api/plans ──────────────────────────────────────
exports.createPlan = async (req, res) => {
  const { plan_type, amount, target_amount, duration, start_date } = req.body;
  const userId = req.user.id;

  if (!plan_type || !amount || !duration || !start_date) {
    return res.status(400).json({ message: 'plan_type, amount, duration and start_date are required' });
  }
  if (!['Monthly', 'Weekly', 'Daily'].includes(plan_type)) {
    return res.status(400).json({ message: 'plan_type must be Monthly, Weekly or Daily' });
  }
  if (amount < MIN_AMOUNTS[plan_type]) {
    return res.status(400).json({
      message: `Minimum amount for ${plan_type} plan is ₦${MIN_AMOUNTS[plan_type].toLocaleString()}`
    });
  }

  try {
    // Cancel any existing active plan
    await db.execute(
      "UPDATE payment_plans SET status = 'Cancelled' WHERE user_id = ? AND status = 'Active'",
      [userId]
    );

    const endDate = calcEndDate(start_date, plan_type, duration);
    const nextPayment = calcNextPayment(start_date, plan_type);
    const calculatedTarget = target_amount || (amount * duration);

    const [result] = await db.execute(
      `INSERT INTO payment_plans
        (user_id, plan_type, amount, target_amount, duration, start_date, end_date, next_payment_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, plan_type, amount, calculatedTarget, duration, start_date, endDate, nextPayment]
    );

    res.status(201).json({
      status: 'success',
      message: `${plan_type} plan created`,
      data: {
        plan_id: result.insertId,
        end_date: endDate,
        next_payment_date: nextPayment
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── PUT /api/plans/:id ───────────────────────────────────
exports.updatePlan = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { plan_type, amount, duration, start_date, end_date, next_payment_date, target_amount } = req.body;

  try {
    const [existing] = await db.execute(
      'SELECT * FROM payment_plans WHERE id = ? AND user_id = ?', [id, userId]
    );
    if (existing.length === 0) return res.status(404).json({ message: 'Plan not found' });

    const plan = existing[0];

    // Resolve final values - use provided or fall back to existing
    const resolvedType = plan_type || plan.plan_type;
    const resolvedDuration = duration !== undefined && duration !== null ? parseInt(duration) : plan.duration;
    const resolvedStart = start_date || toDateStr(plan.start_date);
    const resolvedAmount = amount || plan.amount;

    // Validate min amount if amount or plan_type changed
    if ((amount || plan_type) && resolvedAmount < MIN_AMOUNTS[resolvedType]) {
      return res.status(400).json({
        message: `Minimum amount for ${resolvedType} plan is ₦${MIN_AMOUNTS[resolvedType].toLocaleString()}`
      });
    }

    // Always recalculate dates based on resolved values unless explicitly provided
    const resolvedEndDate = end_date || calcEndDate(resolvedStart, resolvedType, resolvedDuration);
    const resolvedNextPayment = next_payment_date || calcNextPayment(resolvedStart, resolvedType);
    const resolvedTarget = target_amount || (resolvedAmount * resolvedDuration);

    await db.execute(
      `UPDATE payment_plans SET
        plan_type         = ?,
        amount            = ?,
        duration   = ?,
        start_date        = ?,
        end_date          = ?,
        next_payment_date = ?,
        target_amount     = ?,
        updated_at        = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        resolvedType,
        resolvedAmount,
        resolvedDuration,
        resolvedStart,
        resolvedEndDate,
        resolvedNextPayment,
        resolvedTarget,
        id, userId
      ]
    );

    const [updated] = await db.execute('SELECT * FROM payment_plans WHERE id = ?', [id]);
    const u = updated[0];

    res.status(200).json({
      status: 'success',
      message: 'Plan updated',
      data: {
        id: u.id,
        plan_type: u.plan_type,
        amount: u.amount,
        duration: u.duration,
        duration_unit: u.plan_type === 'Monthly' ? 'months' : u.plan_type === 'Weekly' ? 'weeks' : 'days',
        start_date: toDateStr(u.start_date),
        end_date: toDateStr(u.end_date),
        next_payment_date: toDateStr(u.next_payment_date),
        target_amount: u.target_amount,
        status: u.status
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── POST /api/plans/:id/pause ────────────────────────────
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

// ─── POST /api/plans/:id/resume ───────────────────────────
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

// ─── PATCH /api/plans/:id/settings ───────────────────────
exports.updateSettings = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { auto_renewal, payment_reminders, auto_debit } = req.body;
  try {
    await db.execute(
      `UPDATE payment_plans SET
        auto_renewal      = COALESCE(?, auto_renewal),
        payment_reminders = COALESCE(?, payment_reminders),
        auto_debit        = COALESCE(?, auto_debit)
       WHERE id = ? AND user_id = ?`,
      [auto_renewal ?? null, payment_reminders ?? null, auto_debit ?? null, id, userId]
    );
    res.status(200).json({ status: 'success', message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ─── DELETE /api/plans/:id ────────────────────────────────
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