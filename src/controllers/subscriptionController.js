const { query } = require('../config/database');

exports.getStatus = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'none', isPremium: false });
    }

    const sub = result.rows[0];
    const now = new Date();
    let isPremium = false;

    if (sub.status === 'trial' && sub.trial_end && new Date(sub.trial_end) > now) {
      isPremium = true;
    } else if (sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) > now) {
      isPremium = true;
    }

    res.json({
      status: sub.status,
      isPremium,
      trialEnd: sub.trial_end,
      currentPeriodEnd: sub.current_period_end,
      productId: sub.product_id,
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyReceipt = async (req, res, next) => {
  try {
    const { transactionId, productId, originalTransactionId } = req.body;
    if (!transactionId || !productId) {
      return res.status(400).json({ error: 'Transaction ID and product ID are required' });
    }

    // In production, verify the JWS signed transaction with Apple's servers.
    // For now, trust the client and store the subscription.
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const result = await query(
      `INSERT INTO subscriptions (user_id, apple_transaction_id, product_id, status,
       current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', NOW(), $4)
       ON CONFLICT (user_id) DO UPDATE SET
         apple_transaction_id = EXCLUDED.apple_transaction_id,
         product_id = EXCLUDED.product_id,
         status = 'active',
         current_period_start = NOW(),
         current_period_end = EXCLUDED.current_period_end,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, originalTransactionId || transactionId, productId, periodEnd]
    );

    const sub = result.rows[0];
    res.json({
      status: sub.status,
      isPremium: true,
      currentPeriodEnd: sub.current_period_end,
    });
  } catch (err) {
    next(err);
  }
};
