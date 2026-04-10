const { query } = require('../config/database');

function abbreviateName(fullName) {
  if (!fullName) return 'Athlete';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

const EFFECTIVE_STREAK_SQL = `
  CASE
    WHEN u.email LIKE '%@ican.seed' THEN s.current_streak
    WHEN s.last_entry_date >= CURRENT_DATE - INTERVAL '1 day' THEN s.current_streak
    ELSE 0
  END
`;

exports.getGlobalLeaderboard = async (req, res, next) => {
  try {
    const userId = req.userId;

    const result = await query(
      `WITH ranked AS (
         SELECT
           u.id AS user_id,
           COALESCE(u.full_name, 'Athlete') AS full_name,
           u.sport,
           u.country,
           ${EFFECTIVE_STREAK_SQL} AS current_streak,
           s.longest_streak,
           ROW_NUMBER() OVER (ORDER BY ${EFFECTIVE_STREAK_SQL} DESC, s.longest_streak DESC, s.updated_at ASC) AS rank
         FROM streaks s
         JOIN users u ON u.id = s.user_id
         WHERE u.onboarding_completed = TRUE
       )
       SELECT * FROM ranked WHERE rank <= 15
       UNION ALL
       SELECT * FROM ranked WHERE user_id = $1 AND rank > 15`,
      [userId]
    );

    const topRows = result.rows.filter(r => parseInt(r.rank) <= 15);
    const myRow = result.rows.find(r => r.user_id === userId);

    res.json({
      leaderboard: topRows.map(row => ({
        rank: parseInt(row.rank),
        userId: row.user_id,
        fullName: row.user_id === userId ? row.full_name : abbreviateName(row.full_name),
        sport: row.sport,
        country: row.country,
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        isMe: row.user_id === userId,
      })),
      myRank: myRow ? parseInt(myRow.rank) : null,
      myStreak: myRow ? (parseInt(myRow.current_streak) || 0) : 0,
    });
  } catch (err) {
    next(err);
  }
};

exports.getCountryLeaderboard = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { code } = req.params;

    if (!code || !/^[A-Za-z]{2}$/.test(code)) {
      return res.status(400).json({ error: 'Valid 2-letter country code is required' });
    }

    const countryCode = code.toUpperCase();

    const result = await query(
      `WITH ranked AS (
         SELECT
           u.id AS user_id,
           COALESCE(u.full_name, 'Athlete') AS full_name,
           u.sport,
           u.country,
           ${EFFECTIVE_STREAK_SQL} AS current_streak,
           s.longest_streak,
           ROW_NUMBER() OVER (ORDER BY ${EFFECTIVE_STREAK_SQL} DESC, s.longest_streak DESC, s.updated_at ASC) AS rank
         FROM streaks s
         JOIN users u ON u.id = s.user_id
         WHERE u.onboarding_completed = TRUE AND UPPER(u.country) = $1
       )
       SELECT * FROM ranked WHERE rank <= 15
       UNION ALL
       SELECT * FROM ranked WHERE user_id = $2 AND rank > 15`,
      [countryCode, userId]
    );

    const topRows = result.rows.filter(r => parseInt(r.rank) <= 15);
    const myRow = result.rows.find(r => r.user_id === userId);

    res.json({
      leaderboard: topRows.map(row => ({
        rank: parseInt(row.rank),
        userId: row.user_id,
        fullName: row.user_id === userId ? row.full_name : abbreviateName(row.full_name),
        sport: row.sport,
        country: row.country,
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        isMe: row.user_id === userId,
      })),
      myRank: myRow ? parseInt(myRow.rank) : null,
      myStreak: myRow ? (parseInt(myRow.current_streak) || 0) : 0,
      countryCode,
    });
  } catch (err) {
    next(err);
  }
};
