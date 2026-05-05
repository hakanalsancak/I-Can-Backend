const { query } = require('../config/database');
const { notifyFollow } = require('../services/communityNotifier');

const UUID = /^[0-9a-fA-F-]{36}$/;
const HANDLE = /^[a-z0-9_]{3,30}$/;

function formatProfile(row, viewerId) {
  return {
    id: row.id,
    handle: row.handle || null,
    fullName: row.full_name || null,
    username: row.username || null,
    bio: row.bio || null,
    sport: row.sport || null,
    position: row.position || null,
    team: row.team || null,
    country: row.country || null,
    profilePhotoUrl: row.profile_photo_url || null,
    profileVisibility: row.profile_visibility || 'public',
    isSelf: row.id === viewerId,
    stats: {
      currentStreak: row.current_streak ?? 0,
      longestStreak: row.longest_streak ?? 0,
      totalSessions: row.total_sessions ?? 0,
      postCount: row.post_count ?? 0,
      followerCount: row.follower_count ?? 0,
      followingCount: row.following_count ?? 0,
    },
    relation: {
      isFriend: row.is_friend === true,
      isFollowing: row.is_following === true,
      isFollowedBy: row.is_followed_by === true,
      isBlocked: row.is_blocked === true,
    },
  };
}

const PROFILE_SELECT = `
  SELECT u.id, u.handle, u.full_name, u.username, u.bio, u.sport, u.position,
         u.team, u.country, u.profile_photo_url, u.profile_visibility,
         CASE
           WHEN s.last_entry_date >= CURRENT_DATE - INTERVAL '1 day'
             THEN s.current_streak ELSE 0
         END AS current_streak,
         s.longest_streak,
         (SELECT COUNT(*)::int FROM daily_entries de WHERE de.user_id = u.id) AS total_sessions,
         (SELECT COUNT(*)::int FROM posts p
            WHERE p.author_id = u.id AND p.deleted_at IS NULL) AS post_count,
         (SELECT COUNT(*)::int FROM follows f WHERE f.followee_id = u.id) AS follower_count,
         (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
         EXISTS (SELECT 1 FROM friendships fr
                  WHERE fr.user_id = $2 AND fr.friend_id = u.id) AS is_friend,
         EXISTS (SELECT 1 FROM follows f
                  WHERE f.follower_id = $2 AND f.followee_id = u.id) AS is_following,
         EXISTS (SELECT 1 FROM follows f
                  WHERE f.follower_id = u.id AND f.followee_id = $2) AS is_followed_by,
         EXISTS (SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = $2 AND b.blocked_id = u.id)
                     OR (b.blocker_id = u.id AND b.blocked_id = $2)) AS is_blocked
    FROM users u
    LEFT JOIN streaks s ON s.user_id = u.id
   WHERE u.id = $1
`;

// GET /api/community/users/me
exports.getMyProfile = async (req, res, next) => {
  try {
    const result = await query(PROFILE_SELECT, [req.userId, req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(formatProfile(result.rows[0], req.userId));
  } catch (err) {
    next(err);
  }
};

// GET /api/community/users/:id
exports.getProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const result = await query(PROFILE_SELECT, [id, req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const row = result.rows[0];

    if (row.is_blocked && row.id !== req.userId) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (row.profile_visibility === 'private' && row.id !== req.userId) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (row.profile_visibility === 'friends'
        && row.id !== req.userId
        && row.is_friend !== true) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(formatProfile(row, req.userId));
  } catch (err) {
    next(err);
  }
};

// PUT /api/community/users/me/handle
exports.setHandle = async (req, res, next) => {
  try {
    const { handle } = req.body || {};
    if (typeof handle !== 'string') {
      return res.status(400).json({ error: 'handle required' });
    }
    const lower = handle.trim().toLowerCase();
    if (!HANDLE.test(lower)) {
      return res.status(400).json({
        error: 'Handle must be 3–30 lowercase letters, numbers, or underscores',
      });
    }

    const existing = await query(
      'SELECT id FROM users WHERE handle = $1 AND id <> $2',
      [lower, req.userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Handle already taken' });
    }

    await query('UPDATE users SET handle = $1 WHERE id = $2', [lower, req.userId]);
    res.json({ handle: lower });
  } catch (err) {
    next(err);
  }
};

// PUT /api/community/users/me/notifications { enabled: bool }
exports.setNotificationPref = async (req, res, next) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    await query(
      'UPDATE users SET community_notifications_enabled = $1 WHERE id = $2',
      [enabled, req.userId]
    );
    res.json({ enabled });
  } catch (err) {
    next(err);
  }
};

// PUT /api/community/users/me/bio
exports.setBio = async (req, res, next) => {
  try {
    const { bio } = req.body || {};
    if (bio !== null && typeof bio !== 'string') {
      return res.status(400).json({ error: 'bio must be a string or null' });
    }
    let cleaned = null;
    if (typeof bio === 'string') {
      cleaned = bio.trim();
      if (cleaned.length > 200) {
        return res.status(400).json({ error: 'bio must be 200 characters or fewer' });
      }
      if (cleaned.length === 0) cleaned = null;
    }
    await query('UPDATE users SET bio = $1 WHERE id = $2', [cleaned, req.userId]);
    res.json({ bio: cleaned });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/users/:id/follow
exports.follow = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (id === req.userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const target = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const blocked = await query(
      `SELECT 1 FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = $2)
           OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
      [req.userId, id]
    );
    if (blocked.rows.length > 0) {
      return res.status(403).json({ error: 'Action not allowed' });
    }

    const ins = await query(
      `INSERT INTO follows (follower_id, followee_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [req.userId, id]
    );
    if (ins.rowCount > 0) {
      notifyFollow({ senderId: req.userId, followeeId: id })
        .catch(err => console.error('notifyFollow error:', err.message));
    }
    res.json({ following: true });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/community/users/:id/follow
exports.unfollow = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    await query(
      'DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [req.userId, id]
    );
    res.json({ following: false });
  } catch (err) {
    next(err);
  }
};
