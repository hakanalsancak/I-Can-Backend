const { query } = require('../config/database');

async function checkPremiumAccess(userId) {
  const result = await query(
    'SELECT * FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) return false;

  const sub = result.rows[0];
  const now = new Date();

  if (sub.status === 'trial' && sub.trial_end && new Date(sub.trial_end) > now) {
    return true;
  }
  if (sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) > now) {
    return true;
  }

  return false;
}

module.exports = { checkPremiumAccess };
