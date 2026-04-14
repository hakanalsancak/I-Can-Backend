const { query } = require('../config/database');

exports.updatePreferences = async (req, res, next) => {
  try {
    const { notificationFrequency } = req.body;
    if (notificationFrequency === undefined || notificationFrequency < 0 || notificationFrequency > 3) {
      return res.status(400).json({ error: 'Notification frequency must be between 0 and 3' });
    }

    await query(
      'UPDATE users SET notification_frequency = $1, updated_at = NOW() WHERE id = $2',
      [notificationFrequency, req.userId]
    );

    res.json({ notificationFrequency });
  } catch (err) {
    next(err);
  }
};

exports.registerDeviceToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Device token is required' });
    }
    if (!/^[a-fA-F0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid device token format' });
    }

    await query('DELETE FROM device_tokens WHERE user_id = $1 AND token <> $2', [req.userId, token]);
    await query(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES ($1, $2, 'ios')
       ON CONFLICT (user_id, token) DO NOTHING`,
      [req.userId, token]
    );

    res.json({ message: 'Device token registered' });
  } catch (err) {
    next(err);
  }
};
