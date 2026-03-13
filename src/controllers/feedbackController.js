const { query } = require('../config/database');

exports.submit = async (req, res, next) => {
  try {
    const { message, email } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    await query(
      'INSERT INTO feedback (user_id, message, email) VALUES ($1, $2, $3)',
      [req.userId, message.trim(), email?.trim() || null]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
