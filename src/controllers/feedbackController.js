const { query } = require('../config/database');
const { sendFeedbackEmail } = require('../services/emailService');

const VALID_FEEDBACK_TYPES = ['feedback', 'bug_report', 'campaign'];

exports.submit = async (req, res, next) => {
  try {
    const { message, email, type } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ error: 'Feedback message exceeds 5000 character limit' });
    }

    const feedbackType = VALID_FEEDBACK_TYPES.includes(type) ? type : 'feedback';
    const trimmedMessage = message.trim();
    const replyEmail = email?.trim() || null;

    await query(
      'INSERT INTO feedback (user_id, type, message, email) VALUES ($1, $2, $3, $4)',
      [req.userId, feedbackType, trimmedMessage, replyEmail]
    );

    // Fire-and-forget email notification — must never block the response or fail the insert.
    (async () => {
      try {
        const userResult = await query(
          'SELECT username, email FROM users WHERE id = $1',
          [req.userId]
        );
        const user = userResult.rows[0] || {};
        await sendFeedbackEmail({
          type: feedbackType,
          message: trimmedMessage,
          email: replyEmail,
          userId: req.userId,
          username: user.username,
          accountEmail: user.email,
        });
      } catch (err) {
        console.error('Feedback email send failed:', err.message);
      }
    })();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
