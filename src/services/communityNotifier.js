const { query } = require('../config/database');
const { sendPush } = require('../config/apns');
const { logNotification } = require('./notificationService');

/**
 * Send a community push to a single user. Best-effort:
 *   - silently no-ops if the user opted out, has no devices, or APNS isn't configured
 *   - never throws; errors are logged but don't propagate to the caller
 */
async function sendCommunityPush(userId, { title, body, data = {} }) {
  if (!userId) return;
  try {
    const u = await query(
      'SELECT community_notifications_enabled FROM users WHERE id = $1',
      [userId]
    );
    if (!u.rows[0]) return;
    if (u.rows[0].community_notifications_enabled !== true) return;

    const tokens = await query(
      'SELECT token FROM device_tokens WHERE user_id = $1',
      [userId]
    );
    if (tokens.rows.length === 0) return;

    await sendPush(
      tokens.rows.map(r => r.token),
      { title, body, data }
    );

    try {
      await logNotification(userId, 'community', JSON.stringify({ title, body, data }));
    } catch {
      // logging is non-critical
    }
  } catch (err) {
    console.error('Community push failed:', err.message);
  }
}

async function senderDisplayName(senderId) {
  const r = await query(
    'SELECT full_name, username FROM users WHERE id = $1',
    [senderId]
  );
  const row = r.rows[0] || {};
  if (row.full_name && row.full_name.trim()) return row.full_name.trim();
  if (row.username && row.username.trim()) return row.username.trim();
  return 'Someone';
}

async function notifyDM({ senderId, recipientId, conversationId, body }) {
  if (!recipientId || recipientId === senderId) return;
  const name = await senderDisplayName(senderId);
  const trimmed = (body || '').trim().slice(0, 140);
  await sendCommunityPush(recipientId, {
    title: name,
    body: trimmed.length > 0 ? trimmed : 'New message',
    data: { type: 'community.dm', conversationId },
  });
}

async function notifyFollow({ senderId, followeeId }) {
  if (!followeeId || followeeId === senderId) return;
  const name = await senderDisplayName(senderId);
  await sendCommunityPush(followeeId, {
    title: name,
    body: 'started following you.',
    data: { type: 'community.follow', userId: senderId },
  });
}

module.exports = {
  sendCommunityPush,
  notifyDM,
  notifyFollow,
};
