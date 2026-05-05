const { query, getClient } = require('../config/database');

const UUID = /^[0-9a-fA-F-]{36}$/;
const COMMENT_MAX = 1000;

function formatComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    authorUsername: row.author_username || null,
    authorFullName: row.author_full_name || null,
    authorPhotoUrl: row.author_photo_url || null,
    body: row.body,
    parentId: row.parent_id || null,
    createdAt: row.created_at,
  };
}

async function postExists(postId) {
  const r = await query(
    'SELECT id, author_id FROM posts WHERE id = $1 AND deleted_at IS NULL',
    [postId]
  );
  return r.rows[0] || null;
}

async function isBlockedBetween(a, b) {
  const r = await query(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1`,
    [a, b]
  );
  return r.rows.length > 0;
}

// POST /api/community/posts/:id/like
exports.likePost = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const post = await postExists(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (await isBlockedBetween(req.userId, post.author_id)) {
      return res.status(403).json({ error: 'Action not allowed' });
    }

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO post_likes (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [req.userId, id]
    );
    if (ins.rowCount > 0) {
      await client.query(
        'UPDATE posts SET like_count = like_count + 1 WHERE id = $1',
        [id]
      );
    }
    const after = await client.query(
      'SELECT like_count FROM posts WHERE id = $1',
      [id]
    );
    await client.query('COMMIT');

    res.json({ liked: true, likeCount: after.rows[0]?.like_count ?? 0 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// DELETE /api/community/posts/:id/like
exports.unlikePost = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    await client.query('BEGIN');
    const del = await client.query(
      'DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2 RETURNING 1',
      [req.userId, id]
    );
    if (del.rowCount > 0) {
      await client.query(
        'UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1',
        [id]
      );
    }
    const after = await client.query(
      'SELECT like_count FROM posts WHERE id = $1',
      [id]
    );
    await client.query('COMMIT');

    if (after.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ liked: false, likeCount: after.rows[0].like_count });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// POST /api/community/posts/:id/save
exports.savePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }
    const post = await postExists(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    await query(
      `INSERT INTO post_saves (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.userId, id]
    );
    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/community/posts/:id/save
exports.unsavePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }
    await query(
      'DELETE FROM post_saves WHERE user_id = $1 AND post_id = $2',
      [req.userId, id]
    );
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
};

// GET /api/community/posts/:id/comments?cursor=&limit=
exports.getComments = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 30;
    const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
    const { cursor } = req.query;
    let cursorTs = null;
    if (cursor) {
      if (typeof cursor !== 'string' || !ISO_TS.test(cursor)) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      cursorTs = cursor;
    }

    const post = await postExists(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const baseSql = `
      SELECT c.id, c.post_id, c.author_id, c.parent_id, c.body, c.created_at,
             u.username   AS author_username,
             u.full_name  AS author_full_name,
             u.profile_photo_url AS author_photo_url
        FROM post_comments c
        JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $1
         AND c.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
            WHERE (b.blocker_id = $2 AND b.blocked_id = c.author_id)
               OR (b.blocker_id = c.author_id AND b.blocked_id = $2)
         )`;

    let result;
    if (cursorTs) {
      result = await query(
        `${baseSql} AND c.created_at < $3::timestamptz
         ORDER BY c.created_at DESC LIMIT $4`,
        [id, req.userId, cursorTs, limit]
      );
    } else {
      result = await query(
        `${baseSql} ORDER BY c.created_at DESC LIMIT $3`,
        [id, req.userId, limit]
      );
    }

    const items = result.rows.map(formatComment);
    const nextCursor = items.length === limit
      ? items[items.length - 1].createdAt
      : null;
    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/posts/:id/comments
exports.createComment = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }
    const { body, parentId } = req.body || {};
    if (typeof body !== 'string') {
      return res.status(400).json({ error: 'body must be a string' });
    }
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > COMMENT_MAX) {
      return res.status(400).json({ error: `body must be 1–${COMMENT_MAX} characters` });
    }
    if (parentId !== undefined && parentId !== null && !UUID.test(parentId)) {
      return res.status(400).json({ error: 'Invalid parentId' });
    }

    const post = await postExists(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (await isBlockedBetween(req.userId, post.author_id)) {
      return res.status(403).json({ error: 'Action not allowed' });
    }

    if (parentId) {
      const parent = await query(
        'SELECT id FROM post_comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL',
        [parentId, id]
      );
      if (parent.rows.length === 0) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
    }

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO post_comments (post_id, author_id, parent_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, post_id, author_id, parent_id, body, created_at`,
      [id, req.userId, parentId || null, trimmed]
    );
    await client.query(
      'UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1',
      [id]
    );
    await client.query('COMMIT');

    const author = await query(
      'SELECT username, full_name, profile_photo_url FROM users WHERE id = $1',
      [req.userId]
    );
    const a = author.rows[0] || {};
    res.status(201).json(formatComment({
      ...inserted.rows[0],
      author_username: a.username,
      author_full_name: a.full_name,
      author_photo_url: a.profile_photo_url,
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// DELETE /api/community/comments/:id — author only
exports.deleteComment = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid comment id' });
    }

    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE post_comments
          SET deleted_at = NOW()
        WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
        RETURNING post_id`,
      [id, req.userId]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Comment not found' });
    }
    await client.query(
      'UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1',
      [updated.rows[0].post_id]
    );
    await client.query('COMMIT');

    res.json({ id, deleted: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};
