const { query } = require('../config/database');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

// Load the user's stored IANA timezone. Falls back to UTC.
async function getUserTimezone(fn, userId) {
  const result = await fn(
    `SELECT COALESCE(timezone, 'UTC') AS tz FROM users WHERE id = $1`,
    [userId]
  );
  return (result.rows[0] && result.rows[0].tz) || 'UTC';
}

/**
 * Compute current streak from actual daily_entries rows using a recursive CTE.
 * All "today/yesterday" comparisons are evaluated in the user's local timezone,
 * not the DB server's timezone — otherwise a UK user logging at 00:15 local
 * (still the previous UTC day) gets a streak computed against the wrong date.
 */
async function computeStreakFromEntries(client_or_query, userId) {
  const fn = typeof client_or_query === 'function' ? client_or_query : client_or_query.query.bind(client_or_query);
  const tz = await getUserTimezone(fn, userId);
  const result = await fn(
    `WITH RECURSIVE streak AS (
        -- Base: most recent entry that is today or yesterday in the user's timezone
        SELECT entry_date, 1 AS streak_count
        FROM (
            SELECT DISTINCT entry_date
            FROM daily_entries
            WHERE user_id = $1
              AND entry_date >= (NOW() AT TIME ZONE $2)::date - 1
              AND entry_date <= (NOW() AT TIME ZONE $2)::date
            ORDER BY entry_date DESC
            LIMIT 1
        ) latest

        UNION ALL

        -- Walk backwards one day at a time
        SELECT d.entry_date, s.streak_count + 1
        FROM streak s
        JOIN (SELECT DISTINCT entry_date FROM daily_entries WHERE user_id = $1) d
          ON d.entry_date = s.entry_date - 1
    )
    SELECT COALESCE(MAX(streak_count), 0) AS current_streak
    FROM streak`,
    [userId, tz]
  );
  return result.rows[0].current_streak;
}

/**
 * Fast incremental streak for the write path (entry submission).
 * Uses the user's local timezone for the today/yesterday comparison so that a
 * log submitted just past local midnight is treated as a new day relative to
 * the previous local entry — not the previous UTC entry.
 */
async function incrementalStreak(client_or_query, userId) {
  const fn = typeof client_or_query === 'function' ? client_or_query : client_or_query.query.bind(client_or_query);
  const tz = await getUserTimezone(fn, userId);
  const result = await fn(
    `SELECT current_streak, last_entry_date
     FROM streaks WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return 1;
  const { current_streak, last_entry_date } = result.rows[0];
  const lastStr = last_entry_date
    ? (last_entry_date instanceof Date ? last_entry_date.toISOString().split('T')[0] : String(last_entry_date).split('T')[0])
    : null;
  const todayResult = await fn(
    `SELECT (NOW() AT TIME ZONE $1)::date AS today,
            (NOW() AT TIME ZONE $1)::date - 1 AS yesterday`,
    [tz]
  );
  const today = todayResult.rows[0].today.toISOString().split('T')[0];
  const yesterday = todayResult.rows[0].yesterday.toISOString().split('T')[0];
  if (lastStr === today) return current_streak;
  if (lastStr === yesterday) return current_streak + 1;
  return 1;
}

exports.computeStreakFromEntries = computeStreakFromEntries;
exports.incrementalStreak = incrementalStreak;

exports.getStreak = async (req, res, next) => {
  try {
    // Compute current streak from actual entries (timezone-aware)
    const currentStreak = await computeStreakFromEntries(query, req.userId);

    // Fetch longest streak from the streaks table
    const result = await query(
      'SELECT longest_streak, last_entry_date FROM streaks WHERE user_id = $1',
      [req.userId]
    );

    const longestStreak = result.rows.length > 0
      ? Math.max(result.rows[0].longest_streak, currentStreak)
      : currentStreak;
    const lastEntryDate = result.rows.length > 0
      ? formatDate(result.rows[0].last_entry_date)
      : null;

    // Keep the streaks table in sync
    if (result.rows.length > 0) {
      await query(
        `UPDATE streaks SET current_streak = $1, longest_streak = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [currentStreak, longestStreak, req.userId]
      );
    }

    res.json({ currentStreak, longestStreak, lastEntryDate });
  } catch (err) {
    next(err);
  }
};
