const { query } = require('../config/database');

exports.getStreak = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM streaks WHERE user_id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ currentStreak: 0, longestStreak: 0, lastEntryDate: null });
    }

    const s = result.rows[0];
    res.json({
      currentStreak: s.current_streak,
      longestStreak: s.longest_streak,
      lastEntryDate: s.last_entry_date,
    });
  } catch (err) {
    next(err);
  }
};
