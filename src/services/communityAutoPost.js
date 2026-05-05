const { query } = require('../config/database');

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 200, 365, 500, 1000];

function isMilestone(streak) {
  return STREAK_MILESTONES.includes(streak);
}

async function maybeAutoPostStreak(userId, currentStreak) {
  if (!isMilestone(currentStreak)) return null;

  const prefs = await query(
    'SELECT auto_share_prefs, sport FROM users WHERE id = $1',
    [userId]
  );
  if (prefs.rows.length === 0) return null;

  const sharePrefs = prefs.rows[0].auto_share_prefs || {};
  if (sharePrefs.streak === false) return null;

  const dup = await query(
    `SELECT id FROM posts
      WHERE author_id = $1
        AND type = 'streak'
        AND deleted_at IS NULL
        AND metadata->>'milestone' = $2`,
    [userId, String(currentStreak)]
  );
  if (dup.rows.length > 0) return null;

  const inserted = await query(
    `INSERT INTO posts (author_id, type, visibility, body, metadata, sport)
     VALUES ($1, 'streak', 'public', $2, $3::jsonb, $4)
     RETURNING id`,
    [
      userId,
      `${currentStreak}-day streak. Don't break it.`,
      JSON.stringify({ milestone: currentStreak }),
      prefs.rows[0].sport || null,
    ]
  );

  return inserted.rows[0]?.id || null;
}

module.exports = { maybeAutoPostStreak, isMilestone, STREAK_MILESTONES };
