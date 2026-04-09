const { query } = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.listConversations = async (req, res, next) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);

    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;
    if (isNaN(offset) || offset < 0) offset = 0;

    const countResult = await query(
      'SELECT COUNT(*)::int AS total FROM conversations WHERE user_id = $1',
      [req.userId]
    );
    const total = countResult.rows[0].total;

    const result = await query(
      `SELECT
         c.id,
         c.title,
         c.is_pinned AS "isPinned",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt",
         (SELECT COUNT(*)::int FROM chat_messages WHERE conversation_id = c.id) AS "messageCount",
         (SELECT LEFT(content, 100)
          FROM chat_messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1) AS "lastMessage"
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.is_pinned DESC, c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    res.json({ conversations: result.rows, total });
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    // Verify ownership
    const convResult = await query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    const { before } = req.query;
    let params;
    let sql;

    if (before) {
      // Validate ISO timestamp
      const d = new Date(before);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid before timestamp' });
      }
      sql = `SELECT id, role, content, created_at AS "createdAt"
             FROM chat_messages
             WHERE conversation_id = $1 AND created_at < $2
             ORDER BY created_at ASC
             LIMIT $3`;
      params = [id, d.toISOString(), limit + 1];
    } else {
      sql = `SELECT id, role, content, created_at AS "createdAt"
             FROM chat_messages
             WHERE conversation_id = $1
             ORDER BY created_at ASC
             LIMIT $2`;
      params = [id, limit + 1];
    }

    const result = await query(sql, params);

    const hasMore = result.rows.length > limit;
    const messages = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.json({ messages, hasMore });
  } catch (err) {
    next(err);
  }
};

exports.renameConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 100) {
      return res.status(400).json({ error: 'Title exceeds 100 character limit' });
    }

    const result = await query(
      'UPDATE conversations SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING id',
      [title.trim(), id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.togglePin = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const result = await query(
      'UPDATE conversations SET is_pinned = NOT is_pinned WHERE id = $1 AND user_id = $2 RETURNING id, is_pinned AS "isPinned"',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, isPinned: result.rows[0].isPinned });
  } catch (err) {
    next(err);
  }
};

exports.deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    // Verify ownership and delete in one query
    const result = await query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
