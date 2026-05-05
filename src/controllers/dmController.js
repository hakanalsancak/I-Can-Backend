const { query, getClient } = require('../config/database');

const UUID = /^[0-9a-fA-F-]{36}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const MAX_BODY = 2000;

function formatMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body || null,
    attachmentType: row.attachment_type || null,
    attachmentRef: row.attachment_ref || null,
    createdAt: row.created_at,
  };
}

function formatConversation(row, viewerId) {
  return {
    id: row.id,
    isGroup: row.is_group,
    title: row.title || null,
    isRequest: row.is_request === true,
    lastMessageAt: row.last_message_at,
    lastReadAt: row.last_read_at,
    unreadCount: row.unread_count ?? 0,
    other: row.other_id ? {
      id: row.other_id,
      fullName: row.other_full_name || null,
      username: row.other_username || null,
      photoUrl: row.other_photo_url || null,
      sport: row.other_sport || null,
    } : null,
    lastMessage: row.last_message_body
      ? {
          senderId: row.last_message_sender_id,
          body: row.last_message_body,
          createdAt: row.last_message_created_at,
        }
      : null,
  };
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

async function areFriends(a, b) {
  const r = await query(
    `SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 LIMIT 1`,
    [a, b]
  );
  return r.rows.length > 0;
}

// GET /api/community/messages/conversations
exports.listConversations = async (req, res, next) => {
  try {
    // 1:1 conversations: find the OTHER member, plus latest message and unread count
    const result = await query(
      `WITH my_convs AS (
         SELECT c.id, c.is_group, c.title, c.last_message_at,
                m_self.last_read_at,
                m_self.is_request
           FROM dm_conversations c
           JOIN dm_conversation_members m_self
             ON m_self.conversation_id = c.id AND m_self.user_id = $1
       )
       SELECT mc.id, mc.is_group, mc.title, mc.last_message_at,
              mc.last_read_at, mc.is_request,
              other.user_id        AS other_id,
              u.full_name          AS other_full_name,
              u.username           AS other_username,
              u.profile_photo_url  AS other_photo_url,
              u.sport              AS other_sport,
              lm.body              AS last_message_body,
              lm.sender_id         AS last_message_sender_id,
              lm.created_at        AS last_message_created_at,
              (
                SELECT COUNT(*)::int FROM dm_messages dm
                 WHERE dm.conversation_id = mc.id
                   AND dm.deleted_at IS NULL
                   AND dm.sender_id <> $1
                   AND (mc.last_read_at IS NULL OR dm.created_at > mc.last_read_at)
              ) AS unread_count
         FROM my_convs mc
         LEFT JOIN LATERAL (
           SELECT m.user_id FROM dm_conversation_members m
            WHERE m.conversation_id = mc.id AND m.user_id <> $1
            LIMIT 1
         ) other ON TRUE
         LEFT JOIN users u ON u.id = other.user_id
         LEFT JOIN LATERAL (
           SELECT body, sender_id, created_at FROM dm_messages
            WHERE conversation_id = mc.id AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
         ) lm ON TRUE
        ORDER BY mc.last_message_at DESC NULLS LAST`,
      [req.userId]
    );

    res.json({
      items: result.rows.map(r => formatConversation(r, req.userId)),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/messages/conversations { recipientId }
// Finds-or-creates a 1:1 conversation. If they're not friends, the conversation
// starts in 'request' state for the recipient.
exports.openConversation = async (req, res, next) => {
  const client = await getClient();
  try {
    const { recipientId } = req.body || {};
    if (!recipientId || !UUID.test(recipientId)) {
      return res.status(400).json({ error: 'Invalid recipientId' });
    }
    if (recipientId === req.userId) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    const recipient = await query('SELECT id FROM users WHERE id = $1', [recipientId]);
    if (recipient.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (await isBlockedBetween(req.userId, recipientId)) {
      return res.status(403).json({ error: 'Action not allowed' });
    }

    // Look for existing 1:1 conversation between these two users
    const existing = await query(
      `SELECT c.id
         FROM dm_conversations c
         JOIN dm_conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
         JOIN dm_conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
        WHERE c.is_group = FALSE
        LIMIT 1`,
      [req.userId, recipientId]
    );
    if (existing.rows.length > 0) {
      return res.json({ id: existing.rows[0].id, isNew: false });
    }

    const friends = await areFriends(req.userId, recipientId);

    await client.query('BEGIN');
    const conv = await client.query(
      `INSERT INTO dm_conversations (is_group) VALUES (FALSE) RETURNING id`
    );
    const convId = conv.rows[0].id;
    await client.query(
      `INSERT INTO dm_conversation_members (conversation_id, user_id, is_request)
       VALUES ($1, $2, FALSE), ($1, $3, $4)`,
      [convId, req.userId, recipientId, !friends]
    );
    await client.query('COMMIT');

    res.status(201).json({ id: convId, isNew: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// GET /api/community/messages/conversations/:id?cursor=&limit=
exports.getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });

    const member = await query(
      `SELECT 1 FROM dm_conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [id, req.userId]
    );
    if (member.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const { cursor } = req.query;
    let cursorTs = null;
    if (cursor) {
      if (typeof cursor !== 'string' || !ISO_TS.test(cursor)) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      cursorTs = cursor;
    }

    const baseSql = `
      SELECT id, conversation_id, sender_id, body, attachment_type, attachment_ref, created_at
        FROM dm_messages
       WHERE conversation_id = $1 AND deleted_at IS NULL`;
    let result;
    if (cursorTs) {
      result = await query(
        `${baseSql} AND created_at < $2::timestamptz ORDER BY created_at DESC LIMIT $3`,
        [id, cursorTs, limit]
      );
    } else {
      result = await query(
        `${baseSql} ORDER BY created_at DESC LIMIT $2`,
        [id, limit]
      );
    }

    const items = result.rows.map(formatMessage);
    const nextCursor = items.length === limit ? items[items.length - 1].createdAt : null;
    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/messages/conversations/:id/messages
exports.sendMessage = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    const { body } = req.body || {};
    if (typeof body !== 'string') {
      return res.status(400).json({ error: 'body must be a string' });
    }
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_BODY) {
      return res.status(400).json({ error: `body must be 1–${MAX_BODY} characters` });
    }

    const member = await query(
      `SELECT 1 FROM dm_conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [id, req.userId]
    );
    if (member.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Block check against the OTHER member of the 1:1 conversation
    const other = await query(
      `SELECT user_id FROM dm_conversation_members
        WHERE conversation_id = $1 AND user_id <> $2 LIMIT 1`,
      [id, req.userId]
    );
    if (other.rows.length > 0) {
      if (await isBlockedBetween(req.userId, other.rows[0].user_id)) {
        return res.status(403).json({ error: 'Action not allowed' });
      }
    }

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO dm_messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, conversation_id, sender_id, body, attachment_type, attachment_ref, created_at`,
      [id, req.userId, trimmed]
    );
    await client.query(
      `UPDATE dm_conversations SET last_message_at = NOW() WHERE id = $1`,
      [id]
    );
    // Sender automatically reads their own message
    await client.query(
      `UPDATE dm_conversation_members SET last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    await client.query('COMMIT');

    res.status(201).json(formatMessage(inserted.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// POST /api/community/messages/conversations/:id/read
exports.markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    const result = await query(
      `UPDATE dm_conversation_members
          SET last_read_at = NOW(), is_request = FALSE
        WHERE conversation_id = $1 AND user_id = $2
        RETURNING last_read_at`,
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ lastReadAt: result.rows[0].last_read_at });
  } catch (err) {
    next(err);
  }
};
