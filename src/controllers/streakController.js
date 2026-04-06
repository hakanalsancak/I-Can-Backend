const { query } = require('../config/database');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

/**
 * Compute current streak from actual daily_entries rows using a recursive CTE.
 * All date comparison happens in Postgres (CURRENT_DATE) so there are no
 * JavaScript timezone mismatches.
 */
async function computeStreakFromEntries(client_or_query, userId) {
  const fn = typeof client_or_query === 'function' ? client_or_query : client_or_query.query.bind(client_or_query);
  const result = await fn(
    `WITH RECURSIVE streak AS (
        -- Base: most recent entry that is today or yesterday
        SELECT entry_date, 1 AS streak_count
        FROM (
            SELECT DISTINCT entry_date
            FROM daily_entries
            WHERE user_id = $1
              AND entry_date >= CURRENT_DATE - 1
              AND entry_date <= CURRENT_DATE
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
    [userId]
  );
  return result.rows[0].current_streak;
}

exports.computeStreakFromEntries = computeStreakFromEntries;

exports.getStreak = async (req, res, next) => {
  try {
    // Compute current streak from actual entries (timezone-safe)
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
