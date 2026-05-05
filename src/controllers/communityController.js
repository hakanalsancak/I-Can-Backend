const { query } = require('../config/database');

const POST_TYPES = new Set([
  'text', 'photo', 'training_log', 'pr', 'streak',
  'progress', 'challenge', 'question',
]);
const VISIBILITIES = new Set(['public', 'friends', 'private']);
const MAX_BODY_LEN = 2000;
const MAX_PHOTO_URL_LEN = 500;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function formatPost(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorUsername: row.author_username || null,
    authorFullName: row.author_full_name || null,
    authorPhotoUrl: row.author_photo_url || null,
    authorSport: row.author_sport || null,
    type: row.type,
    visibility: row.visibility,
    body: row.body || null,
    photoUrl: row.photo_url || null,
    sport: row.sport || null,
    metadata: row.metadata || {},
    likeCount: row.like_count,
    commentCount: row.comment_count,
    likedByMe: row.liked_by_me === true,
    savedByMe: row.saved_by_me === true,
    createdAt: row.created_at,
  };
}

// POST /api/community/posts
exports.createPost = async (req, res, next) => {
  try {
    const { type, visibility, body, photoUrl, metadata, sport } = req.body || {};

    if (!POST_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid post type' });
    }
    const vis = visibility || 'public';
    if (!VISIBILITIES.has(vis)) {
      return res.status(400).json({ error: 'Invalid visibility' });
    }

    let cleanBody = null;
    if (body !== undefined && body !== null) {
      if (typeof body !== 'string') {
        return res.status(400).json({ error: 'body must be a string' });
      }
      cleanBody = body.trim();
      if (cleanBody.length === 0) cleanBody = null;
      else if (cleanBody.length > MAX_BODY_LEN) {
        return res.status(400).json({ error: `body must be ${MAX_BODY_LEN} characters or fewer` });
      }
    }

    let cleanPhotoUrl = null;
    if (photoUrl !== undefined && photoUrl !== null) {
      if (typeof photoUrl !== 'string' || photoUrl.length > MAX_PHOTO_URL_LEN) {
        return res.status(400).json({ error: 'Invalid photoUrl' });
      }
      if (!/^https:\/\//i.test(photoUrl)) {
        return res.status(400).json({ error: 'photoUrl must be https' });
      }
      cleanPhotoUrl = photoUrl;
    }

    if (type === 'text' && !cleanBody) {
      return res.status(400).json({ error: 'Text posts require a body' });
    }
    if (type === 'photo' && !cleanPhotoUrl) {
      return res.status(400).json({ error: 'Photo posts require a photoUrl' });
    }

    let cleanMeta = {};
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        return res.status(400).json({ error: 'metadata must be an object' });
      }
      const serialized = JSON.stringify(metadata);
      if (serialized.length > 4000) {
        return res.status(400).json({ error: 'metadata too large' });
      }
      cleanMeta = metadata;
    }

    let cleanSport = null;
    if (sport !== undefined && sport !== null) {
      if (typeof sport !== 'string' || sport.length > 50) {
        return res.status(400).json({ error: 'Invalid sport' });
      }
      cleanSport = sport;
    } else {
      const me = await query('SELECT sport FROM users WHERE id = $1', [req.userId]);
      cleanSport = me.rows[0]?.sport || null;
    }

    const inserted = await query(
      `INSERT INTO posts
         (author_id, type, visibility, body, photo_url, metadata, sport)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, author_id, type, visibility, body, photo_url, metadata, sport,
                 like_count, comment_count, created_at`,
      [req.userId, type, vis, cleanBody, cleanPhotoUrl, JSON.stringify(cleanMeta), cleanSport]
    );

    const author = await query(
      `SELECT username, full_name, profile_photo_url, sport
         FROM users WHERE id = $1`,
      [req.userId]
    );
    const a = author.rows[0] || {};
    const row = {
      ...inserted.rows[0],
      author_username: a.username,
      author_full_name: a.full_name,
      author_photo_url: a.profile_photo_url,
      author_sport: a.sport,
      liked_by_me: false,
      saved_by_me: false,
    };

    res.status(201).json(formatPost(row));
  } catch (err) {
    next(err);
  }
};

// GET /api/community/feed/foryou?cursor=&limit=
exports.getForYouFeed = async (req, res, next) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 20;

    const { cursor } = req.query;
    let cursorTs = null;
    if (cursor) {
      if (typeof cursor !== 'string' || !ISO_TS.test(cursor)) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      cursorTs = cursor;
    }

    const baseSql = `
      SELECT p.id, p.author_id, p.type, p.visibility, p.body, p.photo_url,
             p.metadata, p.sport, p.like_count, p.comment_count, p.created_at,
             u.username   AS author_username,
             u.full_name  AS author_full_name,
             u.profile_photo_url AS author_photo_url,
             u.sport      AS author_sport,
             EXISTS (
               SELECT 1 FROM post_likes pl
                WHERE pl.post_id = p.id AND pl.user_id = $1
             ) AS liked_by_me,
             EXISTS (
               SELECT 1 FROM post_saves ps
                WHERE ps.post_id = p.id AND ps.user_id = $1
             ) AS saved_by_me
        FROM posts p
        JOIN users u ON u.id = p.author_id
       WHERE p.deleted_at IS NULL
         AND p.visibility = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
            WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id)
               OR (b.blocker_id = p.author_id AND b.blocked_id = $1)
         )`;

    let result;
    if (cursorTs) {
      result = await query(
        `${baseSql} AND p.created_at < $2::timestamptz
         ORDER BY p.created_at DESC LIMIT $3`,
        [req.userId, cursorTs, limit]
      );
    } else {
      result = await query(
        `${baseSql} ORDER BY p.created_at DESC LIMIT $2`,
        [req.userId, limit]
      );
    }

    const items = result.rows.map(formatPost);
    const nextCursor = items.length === limit
      ? items[items.length - 1].createdAt
      : null;

    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
};

// GET /api/community/posts/:id
exports.getPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const UUID = /^[0-9a-fA-F-]{36}$/;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const result = await query(
      `SELECT p.id, p.author_id, p.type, p.visibility, p.body, p.photo_url,
              p.metadata, p.sport, p.like_count, p.comment_count, p.created_at,
              u.username AS author_username,
              u.full_name AS author_full_name,
              u.profile_photo_url AS author_photo_url,
              u.sport AS author_sport,
              EXISTS (SELECT 1 FROM post_likes pl
                       WHERE pl.post_id = p.id AND pl.user_id = $2) AS liked_by_me,
              EXISTS (SELECT 1 FROM post_saves ps
                       WHERE ps.post_id = p.id AND ps.user_id = $2) AS saved_by_me
         FROM posts p
         JOIN users u ON u.id = p.author_id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const row = result.rows[0];

    if (row.visibility === 'private' && row.author_id !== req.userId) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (row.visibility === 'friends' && row.author_id !== req.userId) {
      const friend = await query(
        'SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2',
        [req.userId, row.author_id]
      );
      if (friend.rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }
    }

    const blocked = await query(
      `SELECT 1 FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = $2)
           OR (blocker_id = $2 AND blocked_id = $1)
        LIMIT 1`,
      [req.userId, row.author_id]
    );
    if (blocked.rows.length > 0 && row.author_id !== req.userId) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(formatPost(row));
  } catch (err) {
    next(err);
  }
};

// DELETE /api/community/posts/:id — soft delete; only author
exports.deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const UUID = /^[0-9a-fA-F-]{36}$/;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const result = await query(
      `UPDATE posts
          SET deleted_at = NOW()
        WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ id: result.rows[0].id, deleted: true });
  } catch (err) {
    next(err);
  }
};
