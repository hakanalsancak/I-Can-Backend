const { query, getClient } = require('../config/database');
const { invalidateUserMetaCache } = require('../middleware/auth');

const UUID = /^[0-9a-fA-F-]{36}$/;
const REASONS = new Set([
  'spam', 'harassment', 'hate', 'sexual', 'self_harm', 'false_info', 'other',
]);
const TARGET_KINDS = new Set(['post', 'comment', 'user']);
const AUTO_HIDE_THRESHOLD = 3;

// POST /api/community/reports { targetKind, targetId, reason, note? }
exports.createReport = async (req, res, next) => {
  const client = await getClient();
  try {
    const { targetKind, targetId, reason, note } = req.body || {};
    if (!TARGET_KINDS.has(targetKind)) {
      return res.status(400).json({ error: 'Invalid targetKind' });
    }
    if (!UUID.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' });
    }
    if (!REASONS.has(reason)) {
      return res.status(400).json({ error: 'Invalid reason' });
    }
    let cleanNote = null;
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string') {
        return res.status(400).json({ error: 'note must be a string' });
      }
      cleanNote = note.trim().slice(0, 500);
      if (cleanNote.length === 0) cleanNote = null;
    }

    // Don't allow reporting your own content
    if (targetKind === 'post') {
      const r = await query(
        'SELECT author_id FROM posts WHERE id = $1 AND deleted_at IS NULL',
        [targetId]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
      if (r.rows[0].author_id === req.userId) {
        return res.status(400).json({ error: 'Cannot report your own content' });
      }
    } else if (targetKind === 'comment') {
      const r = await query(
        'SELECT author_id FROM post_comments WHERE id = $1 AND deleted_at IS NULL',
        [targetId]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
      if (r.rows[0].author_id === req.userId) {
        return res.status(400).json({ error: 'Cannot report your own content' });
      }
    } else if (targetKind === 'user') {
      if (targetId === req.userId) {
        return res.status(400).json({ error: 'Cannot report yourself' });
      }
      const r = await query('SELECT 1 FROM users WHERE id = $1', [targetId]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    }

    await client.query('BEGIN');

    // One report per (reporter, target, reason) — return existing if duplicate
    const existing = await client.query(
      `SELECT id FROM post_reports
        WHERE reporter_id = $1 AND target_kind = $2 AND target_id = $3 AND reason = $4
        LIMIT 1`,
      [req.userId, targetKind, targetId, reason]
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({ id: existing.rows[0].id, deduplicated: true });
    }

    const inserted = await client.query(
      `INSERT INTO post_reports (reporter_id, target_kind, target_id, reason, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.userId, targetKind, targetId, reason, cleanNote]
    );

    // Auto-hide post if it has hit the report threshold
    if (targetKind === 'post') {
      const counts = await client.query(
        `SELECT COUNT(DISTINCT reporter_id)::int AS uniq
           FROM post_reports
          WHERE target_kind = 'post'
            AND target_id = $1
            AND created_at > NOW() - INTERVAL '24 hours'`,
        [targetId]
      );
      if ((counts.rows[0]?.uniq || 0) >= AUTO_HIDE_THRESHOLD) {
        await client.query(
          `UPDATE posts SET deleted_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL`,
          [targetId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: inserted.rows[0].id, deduplicated: false });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// POST /api/community/blocks/:userId
exports.block = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!UUID.test(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }
    await query(
      `INSERT INTO blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.userId, userId]
    );
    // Tearing down any follow either direction once they're blocked
    await query(
      `DELETE FROM follows
        WHERE (follower_id = $1 AND followee_id = $2)
           OR (follower_id = $2 AND followee_id = $1)`,
      [req.userId, userId]
    );
    res.json({ blocked: true });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/community/blocks/:userId
exports.unblock = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!UUID.test(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    await query(
      `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [req.userId, userId]
    );
    res.json({ blocked: false });
  } catch (err) {
    next(err);
  }
};

// GET /api/community/blocks
exports.listBlocks = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.blocked_id AS id, u.username, u.full_name, u.profile_photo_url, u.sport,
              b.created_at
         FROM blocks b
         JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1
        ORDER BY b.created_at DESC`,
      [req.userId]
    );
    res.json({
      items: result.rows.map(r => ({
        id: r.id,
        username: r.username || null,
        fullName: r.full_name || null,
        profilePhotoUrl: r.profile_photo_url || null,
        sport: r.sport || null,
        blockedAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ---------- Admin endpoints ----------

// GET /api/community/_admin/reports?status=open
exports.adminListReports = async (req, res, next) => {
  try {
    const { status } = req.query;
    const allowed = ['open', 'reviewed', 'actioned', 'dismissed'];
    const where = allowed.includes(status) ? `WHERE r.status = $1` : '';
    const params = allowed.includes(status) ? [status] : [];
    const result = await query(
      `SELECT r.id, r.target_kind, r.target_id, r.reason, r.note, r.status,
              r.created_at, r.reporter_id,
              ru.username AS reporter_username
         FROM post_reports r
         LEFT JOIN users ru ON ru.id = r.reporter_id
        ${where}
        ORDER BY r.created_at DESC
        LIMIT 200`,
      params
    );
    res.json({ items: result.rows });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/_admin/reports/:id/action { action: 'dismiss'|'hide_post'|'suspend_user', durationDays? }
exports.adminActionReport = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { action, durationDays } = req.body || {};
    if (!UUID.test(id)) {
      return res.status(400).json({ error: 'Invalid report id' });
    }
    if (!['dismiss', 'hide_post', 'suspend_user'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const reportRow = await query(
      `SELECT target_kind, target_id, status FROM post_reports WHERE id = $1`,
      [id]
    );
    if (reportRow.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const report = reportRow.rows[0];

    await client.query('BEGIN');

    if (action === 'dismiss') {
      await client.query(
        `UPDATE post_reports SET status = 'dismissed' WHERE id = $1`,
        [id]
      );
    } else if (action === 'hide_post') {
      if (report.target_kind !== 'post') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'hide_post only valid for post reports' });
      }
      await client.query(
        `UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
        [report.target_id]
      );
      await client.query(
        `UPDATE post_reports SET status = 'actioned' WHERE id = $1`,
        [id]
      );
    } else if (action === 'suspend_user') {
      const days = parseInt(durationDays, 10);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid durationDays' });
      }
      // Find the offending author
      let offenderId = null;
      if (report.target_kind === 'post') {
        const r = await client.query('SELECT author_id FROM posts WHERE id = $1', [report.target_id]);
        offenderId = r.rows[0]?.author_id;
      } else if (report.target_kind === 'comment') {
        const r = await client.query('SELECT author_id FROM post_comments WHERE id = $1', [report.target_id]);
        offenderId = r.rows[0]?.author_id;
      } else if (report.target_kind === 'user') {
        offenderId = report.target_id;
      }
      if (!offenderId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Offender not found' });
      }
      const until = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
      await client.query(
        `UPDATE users SET suspended_until = $1 WHERE id = $2`,
        [until, offenderId]
      );
      invalidateUserMetaCache(offenderId);
      await client.query(
        `UPDATE post_reports SET status = 'actioned' WHERE id = $1`,
        [id]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};
