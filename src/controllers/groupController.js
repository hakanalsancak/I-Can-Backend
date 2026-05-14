const { query, getClient } = require('../config/database');
const { notifyDM, sendCommunityPush } = require('../services/communityNotifier');

const UUID = /^[0-9a-fA-F-]{36}$/;
const MAX_MEMBERS = 100;
const MAX_TITLE = 60;

function trimTitle(t) {
  if (typeof t !== 'string') return '';
  return t.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE);
}

async function senderName(userId) {
  const r = await query(
    'SELECT full_name, username FROM users WHERE id = $1',
    [userId]
  );
  const row = r.rows[0] || {};
  return (row.full_name && row.full_name.trim())
    || (row.username && row.username.trim())
    || 'Someone';
}

async function userName(userId) {
  return senderName(userId);
}

/**
 * Records a system event row in dm_messages and bumps last_message_at.
 * Caller must already be inside a transaction (`client`).
 */
async function insertSystemMessage(client, { conversationId, actorId, event, meta, body }) {
  await client.query(
    `INSERT INTO dm_messages (conversation_id, sender_id, body, is_system, system_event, system_meta)
     VALUES ($1, $2, $3, TRUE, $4, $5::jsonb)`,
    [conversationId, actorId, body || null, event, meta ? JSON.stringify(meta) : null]
  );
  await client.query(
    `UPDATE dm_conversations SET last_message_at = NOW() WHERE id = $1`,
    [conversationId]
  );
}

async function assertActiveMember(conversationId, userId) {
  const r = await query(
    `SELECT role FROM dm_conversation_members
      WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL LIMIT 1`,
    [conversationId, userId]
  );
  return r.rows[0] || null;
}

async function assertGroup(conversationId) {
  const r = await query(
    `SELECT id, is_group, creator_id, title, photo_url
       FROM dm_conversations WHERE id = $1`,
    [conversationId]
  );
  if (r.rows.length === 0) return null;
  return r.rows[0];
}

async function getActiveMemberIds(conversationId) {
  const r = await query(
    `SELECT user_id FROM dm_conversation_members
      WHERE conversation_id = $1 AND left_at IS NULL`,
    [conversationId]
  );
  return r.rows.map(x => x.user_id);
}

async function pushToGroup({ conversationId, actorId, title, body }) {
  const recipients = (await getActiveMemberIds(conversationId)).filter(id => id !== actorId);
  for (const uid of recipients) {
    sendCommunityPush(uid, {
      title,
      body,
      data: { type: 'community.group', conversationId },
    }).catch(err => console.error('group push error:', err.message));
  }
}

// POST /api/community/messages/groups
// body: { title, memberIds: [uuid], photoUrl? }
exports.createGroup = async (req, res, next) => {
  const client = await getClient();
  let begun = false;
  try {
    const { title, memberIds, photoUrl } = req.body || {};
    const cleanTitle = trimTitle(title);
    if (cleanTitle.length === 0) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'memberIds must be a non-empty array' });
    }
    const unique = Array.from(new Set(memberIds));
    if (unique.some(id => typeof id !== 'string' || !UUID.test(id))) {
      return res.status(400).json({ error: 'memberIds must be UUIDs' });
    }
    if (unique.includes(req.userId)) {
      return res.status(400).json({ error: 'creator is added automatically' });
    }
    if (unique.length + 1 > MAX_MEMBERS) {
      return res.status(400).json({ error: `groups cap at ${MAX_MEMBERS} members` });
    }

    let cleanPhotoUrl = null;
    if (photoUrl !== undefined && photoUrl !== null) {
      if (typeof photoUrl !== 'string' || !/^https:\/\//.test(photoUrl) || photoUrl.length > 500) {
        return res.status(400).json({ error: 'photoUrl must be https' });
      }
      cleanPhotoUrl = photoUrl;
    }

    // Friend-only gating: every invited member must currently be a friend.
    const friendCheck = await query(
      `SELECT friend_id FROM friendships
        WHERE user_id = $1 AND friend_id = ANY($2::uuid[])`,
      [req.userId, unique]
    );
    const friendSet = new Set(friendCheck.rows.map(r => r.friend_id));
    const nonFriends = unique.filter(id => !friendSet.has(id));
    if (nonFriends.length > 0) {
      return res.status(403).json({ error: 'Only friends can be added to a group' });
    }

    await client.query('BEGIN');
    begun = true;
    const conv = await client.query(
      `INSERT INTO dm_conversations (is_group, title, creator_id, photo_url)
       VALUES (TRUE, $1, $2, $3)
       RETURNING id`,
      [cleanTitle, req.userId, cleanPhotoUrl]
    );
    const convId = conv.rows[0].id;

    // Creator joins as admin; invited friends join as regular members.
    await client.query(
      `INSERT INTO dm_conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [convId, req.userId]
    );
    for (const uid of unique) {
      await client.query(
        `INSERT INTO dm_conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, 'member')`,
        [convId, uid]
      );
    }

    const actor = await senderName(req.userId);
    await insertSystemMessage(client, {
      conversationId: convId,
      actorId: req.userId,
      event: 'group.create',
      meta: { actorId: req.userId, title: cleanTitle },
      body: `${actor} created the group "${cleanTitle}"`,
    });

    await client.query('COMMIT');
    begun = false;

    pushToGroup({
      conversationId: convId,
      actorId: req.userId,
      title: cleanTitle,
      body: `${actor} added you to the group`,
    });

    res.status(201).json({ id: convId });
  } catch (err) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// GET /api/community/messages/conversations/:id/info
// Returns full group metadata including the active members list.
exports.getGroupInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });

    const conv = await assertGroup(id);
    if (!conv || !conv.is_group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const me = await assertActiveMember(id, req.userId);
    if (!me) return res.status(404).json({ error: 'Group not found' });

    const members = await query(
      `SELECT m.user_id, m.role, m.joined_at,
              u.full_name, u.username, u.profile_photo_url, u.sport, u.last_seen_at
         FROM dm_conversation_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = $1 AND m.left_at IS NULL
        ORDER BY (m.role = 'admin') DESC, u.full_name ASC NULLS LAST`,
      [id]
    );

    res.json({
      id: conv.id,
      isGroup: true,
      title: conv.title,
      photoUrl: conv.photo_url || null,
      creatorId: conv.creator_id,
      viewerRole: me.role,
      members: members.rows.map(r => ({
        id: r.user_id,
        role: r.role,
        joinedAt: r.joined_at,
        fullName: r.full_name || null,
        username: r.username || null,
        photoUrl: r.profile_photo_url || null,
        sport: r.sport || null,
        lastSeenAt: r.last_seen_at || null,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/community/messages/conversations/:id
// body: { title?, photoUrl? }  (admin only)
exports.updateGroup = async (req, res, next) => {
  const client = await getClient();
  let begun = false;
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });

    const conv = await assertGroup(id);
    if (!conv || !conv.is_group) return res.status(404).json({ error: 'Group not found' });
    const me = await assertActiveMember(id, req.userId);
    if (!me) return res.status(404).json({ error: 'Group not found' });
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admins only' });

    const { title, photoUrl } = req.body || {};
    const updates = [];
    const values = [];
    const events = [];
    const actor = await senderName(req.userId);

    if (title !== undefined) {
      const cleanTitle = trimTitle(title);
      if (cleanTitle.length === 0) {
        return res.status(400).json({ error: 'title cannot be empty' });
      }
      if (cleanTitle !== conv.title) {
        values.push(cleanTitle);
        updates.push(`title = $${values.length}`);
        events.push({
          event: 'group.rename',
          meta: { actorId: req.userId, oldTitle: conv.title, newTitle: cleanTitle },
          body: `${actor} renamed the group to "${cleanTitle}"`,
        });
      }
    }

    if (photoUrl !== undefined) {
      if (photoUrl === null || photoUrl === '') {
        if (conv.photo_url !== null) {
          updates.push(`photo_url = NULL`);
          events.push({
            event: 'group.photo',
            meta: { actorId: req.userId, removed: true },
            body: `${actor} removed the group photo`,
          });
        }
      } else {
        if (typeof photoUrl !== 'string' || !/^https:\/\//.test(photoUrl) || photoUrl.length > 500) {
          return res.status(400).json({ error: 'photoUrl must be https' });
        }
        if (photoUrl !== conv.photo_url) {
          values.push(photoUrl);
          updates.push(`photo_url = $${values.length}`);
          events.push({
            event: 'group.photo',
            meta: { actorId: req.userId },
            body: `${actor} changed the group photo`,
          });
        }
      }
    }

    if (updates.length === 0) {
      return res.json({ ok: true, changed: false });
    }

    await client.query('BEGIN');
    begun = true;
    values.push(id);
    await client.query(
      `UPDATE dm_conversations SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    for (const e of events) {
      await insertSystemMessage(client, {
        conversationId: id,
        actorId: req.userId,
        event: e.event,
        meta: e.meta,
        body: e.body,
      });
    }
    await client.query('COMMIT');
    begun = false;

    res.json({ ok: true, changed: true });
  } catch (err) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// POST /api/community/messages/conversations/:id/members  (admin only)
// body: { memberIds: [uuid] }
exports.addMembers = async (req, res, next) => {
  const client = await getClient();
  let begun = false;
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });

    const conv = await assertGroup(id);
    if (!conv || !conv.is_group) return res.status(404).json({ error: 'Group not found' });
    const me = await assertActiveMember(id, req.userId);
    if (!me) return res.status(404).json({ error: 'Group not found' });
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admins only' });

    const { memberIds } = req.body || {};
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'memberIds required' });
    }
    const unique = Array.from(new Set(memberIds));
    if (unique.some(uid => typeof uid !== 'string' || !UUID.test(uid))) {
      return res.status(400).json({ error: 'memberIds must be UUIDs' });
    }
    if (unique.includes(req.userId)) {
      return res.status(400).json({ error: 'cannot add yourself' });
    }

    const existing = await query(
      `SELECT user_id, left_at FROM dm_conversation_members
        WHERE conversation_id = $1 AND user_id = ANY($2::uuid[])`,
      [id, unique]
    );
    const existingMap = new Map(existing.rows.map(r => [r.user_id, r.left_at]));
    const activeCount = await query(
      `SELECT COUNT(*)::int AS n FROM dm_conversation_members
        WHERE conversation_id = $1 AND left_at IS NULL`,
      [id]
    );
    const fresh = unique.filter(uid => !existingMap.has(uid));
    const rejoin = unique.filter(uid => existingMap.has(uid) && existingMap.get(uid) !== null);
    const alreadyActive = unique.filter(uid => existingMap.has(uid) && existingMap.get(uid) === null);
    const additions = [...fresh, ...rejoin];

    if (additions.length === 0) {
      return res.json({ ok: true, added: 0, alreadyActive });
    }
    if (activeCount.rows[0].n + additions.length > MAX_MEMBERS) {
      return res.status(400).json({ error: `groups cap at ${MAX_MEMBERS} members` });
    }

    // Friend-only gating against the admin doing the add.
    const friendCheck = await query(
      `SELECT friend_id FROM friendships
        WHERE user_id = $1 AND friend_id = ANY($2::uuid[])`,
      [req.userId, additions]
    );
    const friendSet = new Set(friendCheck.rows.map(r => r.friend_id));
    if (additions.some(uid => !friendSet.has(uid))) {
      return res.status(403).json({ error: 'Only your friends can be added' });
    }

    await client.query('BEGIN');
    begun = true;
    for (const uid of fresh) {
      await client.query(
        `INSERT INTO dm_conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, 'member')`,
        [id, uid]
      );
    }
    for (const uid of rejoin) {
      await client.query(
        `UPDATE dm_conversation_members
            SET left_at = NULL, role = 'member', joined_at = NOW(),
                last_read_at = NULL, is_request = FALSE
          WHERE conversation_id = $1 AND user_id = $2`,
        [id, uid]
      );
    }
    const actor = await senderName(req.userId);
    for (const uid of additions) {
      const name = await userName(uid);
      await insertSystemMessage(client, {
        conversationId: id,
        actorId: req.userId,
        event: 'group.add',
        meta: { actorId: req.userId, targetId: uid },
        body: `${actor} added ${name}`,
      });
    }
    await client.query('COMMIT');
    begun = false;

    pushToGroup({
      conversationId: id,
      actorId: req.userId,
      title: conv.title || 'Group',
      body: `${actor} added new members`,
    });

    res.json({ ok: true, added: additions.length, alreadyActive });
  } catch (err) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// DELETE /api/community/messages/conversations/:id/members/:userId
//   - admin removing someone else, or
//   - any active member removing themselves (== leave)
exports.removeMember = async (req, res, next) => {
  const client = await getClient();
  let begun = false;
  try {
    const { id, userId } = req.params;
    if (!UUID.test(id) || !UUID.test(userId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const conv = await assertGroup(id);
    if (!conv || !conv.is_group) return res.status(404).json({ error: 'Group not found' });

    const me = await assertActiveMember(id, req.userId);
    if (!me) return res.status(404).json({ error: 'Group not found' });

    const target = await assertActiveMember(id, userId);
    if (!target) return res.status(404).json({ error: 'Member not found' });

    const selfLeave = userId === req.userId;
    if (!selfLeave && me.role !== 'admin') {
      return res.status(403).json({ error: 'Admins only' });
    }

    await client.query('BEGIN');
    begun = true;
    await client.query(
      `UPDATE dm_conversation_members SET left_at = NOW(), role = 'member'
        WHERE conversation_id = $1 AND user_id = $2`,
      [id, userId]
    );

    const actor = await senderName(req.userId);
    if (selfLeave) {
      await insertSystemMessage(client, {
        conversationId: id,
        actorId: req.userId,
        event: 'group.leave',
        meta: { actorId: req.userId },
        body: `${actor} left the group`,
      });
    } else {
      const targetName = await userName(userId);
      await insertSystemMessage(client, {
        conversationId: id,
        actorId: req.userId,
        event: 'group.remove',
        meta: { actorId: req.userId, targetId: userId },
        body: `${actor} removed ${targetName}`,
      });
    }

    // Promote oldest active member to admin if the group has none left.
    const adminLeft = await client.query(
      `SELECT 1 FROM dm_conversation_members
        WHERE conversation_id = $1 AND left_at IS NULL AND role = 'admin' LIMIT 1`,
      [id]
    );
    if (adminLeft.rows.length === 0) {
      const next = await client.query(
        `SELECT user_id FROM dm_conversation_members
          WHERE conversation_id = $1 AND left_at IS NULL
          ORDER BY joined_at ASC LIMIT 1`,
        [id]
      );
      if (next.rows.length > 0) {
        const newAdminId = next.rows[0].user_id;
        await client.query(
          `UPDATE dm_conversation_members SET role = 'admin'
            WHERE conversation_id = $1 AND user_id = $2`,
          [id, newAdminId]
        );
        const newAdminName = await userName(newAdminId);
        await insertSystemMessage(client, {
          conversationId: id,
          actorId: newAdminId,
          event: 'group.promote',
          meta: { actorId: newAdminId, targetId: newAdminId, auto: true },
          body: `${newAdminName} is now an admin`,
        });
      }
    }

    await client.query('COMMIT');
    begun = false;
    res.json({ ok: true });
  } catch (err) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// POST /api/community/messages/conversations/:id/members/:userId/role
// body: { role: 'admin' | 'member' }   (admin only, can't demote yourself
// if you're the last admin)
exports.setMemberRole = async (req, res, next) => {
  const client = await getClient();
  let begun = false;
  try {
    const { id, userId } = req.params;
    if (!UUID.test(id) || !UUID.test(userId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { role } = req.body || {};
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({ error: 'role must be admin or member' });
    }
    const conv = await assertGroup(id);
    if (!conv || !conv.is_group) return res.status(404).json({ error: 'Group not found' });

    const me = await assertActiveMember(id, req.userId);
    if (!me) return res.status(404).json({ error: 'Group not found' });
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admins only' });

    const target = await assertActiveMember(id, userId);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === role) return res.json({ ok: true, changed: false });

    if (role === 'member' && userId === req.userId) {
      const adminCount = await query(
        `SELECT COUNT(*)::int AS n FROM dm_conversation_members
          WHERE conversation_id = $1 AND left_at IS NULL AND role = 'admin'`,
        [id]
      );
      if (adminCount.rows[0].n <= 1) {
        return res.status(400).json({ error: 'Promote another admin before stepping down' });
      }
    }

    await client.query('BEGIN');
    begun = true;
    await client.query(
      `UPDATE dm_conversation_members SET role = $3
        WHERE conversation_id = $1 AND user_id = $2`,
      [id, userId, role]
    );
    const actor = await senderName(req.userId);
    const targetName = await userName(userId);
    await insertSystemMessage(client, {
      conversationId: id,
      actorId: req.userId,
      event: role === 'admin' ? 'group.promote' : 'group.demote',
      meta: { actorId: req.userId, targetId: userId },
      body: role === 'admin'
        ? `${actor} made ${targetName} an admin`
        : `${actor} dismissed ${targetName} as admin`,
    });
    await client.query('COMMIT');
    begun = false;
    res.json({ ok: true, changed: true });
  } catch (err) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};
