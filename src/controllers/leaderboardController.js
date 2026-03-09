const { query } = require('../config/database');

exports.getGlobalLeaderboard = async (req, res, next) => {
  try {
    const userId = req.userId;

    const top100 = await query(
      `SELECT
         u.id AS user_id,
         COALESCE(u.full_name, 'Athlete') AS full_name,
         u.sport,
         u.country,
         s.current_streak,
         s.longest_streak,
         ROW_NUMBER() OVER (ORDER BY s.current_streak DESC, s.longest_streak DESC, s.updated_at ASC) AS rank
       FROM streaks s
       JOIN users u ON u.id = s.user_id
       WHERE u.onboarding_completed = TRUE
       ORDER BY s.current_streak DESC, s.longest_streak DESC, s.updated_at ASC
       LIMIT 15`
    );

    const myRankResult = await query(
      `SELECT rank, current_streak FROM (
         SELECT
           s.user_id,
           s.current_streak,
           ROW_NUMBER() OVER (ORDER BY s.current_streak DESC, s.longest_streak DESC, s.updated_at ASC) AS rank
         FROM streaks s
         JOIN users u ON u.id = s.user_id
         WHERE u.onboarding_completed = TRUE
       ) ranked
       WHERE user_id = $1`,
      [userId]
    );

    const myRank = myRankResult.rows[0];

    res.json({
      leaderboard: top100.rows.map(row => ({
        rank: parseInt(row.rank),
        userId: row.user_id,
        fullName: row.full_name,
        sport: row.sport,
        country: row.country,
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        isMe: row.user_id === userId,
      })),
      myRank: myRank ? parseInt(myRank.rank) : null,
      myStreak: myRank ? (parseInt(myRank.current_streak) || 0) : 0,
    });
  } catch (err) {
    next(err);
  }
};

exports.getCountryLeaderboard = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { code } = req.params;

    if (!code || code.length > 10) {
      return res.status(400).json({ error: 'Valid country code is required' });
    }

    const countryCode = code.toUpperCase();

    const top100 = await query(
      `SELECT
         u.id AS user_id,
         COALESCE(u.full_name, 'Athlete') AS full_name,
         u.sport,
         u.country,
         s.current_streak,
         s.longest_streak,
         ROW_NUMBER() OVER (ORDER BY s.current_streak DESC, s.longest_streak DESC, s.updated_at ASC) AS rank
       FROM streaks s
       JOIN users u ON u.id = s.user_id
       WHERE u.onboarding_completed = TRUE AND UPPER(u.country) = $1
       ORDER BY s.current_streak DESC, s.longest_streak DESC, s.updated_at ASC
       LIMIT 15`,
      [countryCode]
    );

    const myRankResult = await query(
      `SELECT rank, current_streak FROM (
         SELECT
           s.user_id,
           s.current_streak,
           ROW_NUMBER() OVER (ORDER BY s.current_streak DESC, s.longest_streak DESC, s.updated_at ASC) AS rank
         FROM streaks s
         JOIN users u ON u.id = s.user_id
         WHERE u.onboarding_completed = TRUE AND UPPER(u.country) = $1
       ) ranked
       WHERE user_id = $2`,
      [countryCode, userId]
    );

    const myRank = myRankResult.rows[0];

    res.json({
      leaderboard: top100.rows.map(row => ({
        rank: parseInt(row.rank),
        userId: row.user_id,
        fullName: row.full_name,
        sport: row.sport,
        country: row.country,
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        isMe: row.user_id === userId,
      })),
      myRank: myRank ? parseInt(myRank.rank) : null,
      myStreak: myRank ? (parseInt(myRank.current_streak) || 0) : 0,
      countryCode,
    });
  } catch (err) {
    next(err);
  }
};
