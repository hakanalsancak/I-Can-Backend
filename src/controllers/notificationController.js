const { query } = require('../config/database');

exports.updatePreferences = async (req, res, next) => {
  try {
    const { notificationFrequency, communityNotificationsEnabled } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    // Treat null and undefined identically — iOS encodes nil as null.
    if (notificationFrequency !== undefined && notificationFrequency !== null) {
      if (!Number.isInteger(notificationFrequency) || notificationFrequency < 0 || notificationFrequency > 3) {
        return res.status(400).json({ error: 'Notification frequency must be an integer between 0 and 3' });
      }
      updates.push(`notification_frequency = $${idx++}`);
      params.push(notificationFrequency);
    }

    if (communityNotificationsEnabled !== undefined && communityNotificationsEnabled !== null) {
      if (typeof communityNotificationsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'communityNotificationsEnabled must be a boolean' });
      }
      updates.push(`community_notifications_enabled = $${idx++}`);
      params.push(communityNotificationsEnabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No preferences provided' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.userId);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')}
        WHERE id = $${idx}
        RETURNING notification_frequency, community_notifications_enabled`,
      params
    );

    const row = result.rows[0] || {};
    res.json({
      notificationFrequency: row.notification_frequency,
      communityNotificationsEnabled: row.community_notifications_enabled,
    });
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

    // A given APNS token uniquely identifies one physical device. Remove the
    // token from any other user rows so signing into a different account on
    // the same device doesn't leave stale mappings that cause duplicate pushes.
    await query('DELETE FROM device_tokens WHERE token = $1 AND user_id <> $2', [token, req.userId]);
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
