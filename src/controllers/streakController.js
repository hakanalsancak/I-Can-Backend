const { query } = require('../config/database');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

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
    let currentStreak = s.current_streak;

    if (s.last_entry_date && currentStreak > 0) {
      const lastDate = new Date(s.last_entry_date).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      if (lastDate !== today && lastDate !== yesterday) {
        currentStreak = 0;
        await query(
          'UPDATE streaks SET current_streak = 0, updated_at = NOW() WHERE user_id = $1',
          [req.userId]
        );
      }
    }

    res.json({
      currentStreak,
      longestStreak: s.longest_streak,
      lastEntryDate: formatDate(s.last_entry_date),
    });
  } catch (err) {
    next(err);
  }
};
