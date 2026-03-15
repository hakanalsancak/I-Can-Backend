const { query } = require('../config/database');

const VALID_FEEDBACK_TYPES = ['feedback', 'bug_report'];

// Ensure the type column exists (safe to call multiple times)
let typeColumnReady = false;
async function ensureTypeColumn() {
  if (typeColumnReady) return;
  try {
    await query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'feedback'");
    typeColumnReady = true;
  } catch {
    // Column may already exist or DB doesn't support IF NOT EXISTS — either way, mark ready
    typeColumnReady = true;
  }
}

exports.submit = async (req, res, next) => {
  try {
    const { message, email, type } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ error: 'Feedback message exceeds 5000 character limit' });
    }

    await ensureTypeColumn();

    const feedbackType = VALID_FEEDBACK_TYPES.includes(type) ? type : 'feedback';

    await query(
      'INSERT INTO feedback (user_id, type, message, email) VALUES ($1, $2, $3, $4)',
      [req.userId, feedbackType, message.trim(), email?.trim() || null]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
