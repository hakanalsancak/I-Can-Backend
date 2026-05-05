const { query } = require('../config/database');
const { ingestForSport } = require('../services/sportFeed/ingest');

const VALID_CATEGORIES = ['training', 'recovery', 'mindset', 'news'];

function formatArticle(row) {
  return {
    id: String(row.id),
    sport: row.sport,
    category: row.category,
    title: row.title,
    summary: row.summary,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    imageUrl: row.image_url || null,
    relevanceScore: row.relevance_score,
    publishedAt: row.published_at,
  };
}

// GET /api/community/sport-feed?cursor=&limit=&category=
exports.getSportFeed = async (req, res, next) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 20;

    const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
    const { cursor, category } = req.query;
    let cursorTs = null;
    if (cursor) {
      if (typeof cursor !== 'string' || !ISO_TS.test(cursor)) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      cursorTs = cursor;
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const userRow = await query('SELECT sport FROM users WHERE id = $1', [req.userId]);
    const userSport = userRow.rows[0]?.sport || null;

    const params = [];
    const conds = [];
    if (userSport) {
      params.push(userSport);
      conds.push(`a.sport = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conds.push(`a.category = $${params.length}`);
    }
    if (cursorTs) {
      params.push(cursorTs);
      conds.push(`a.published_at < $${params.length}::timestamptz`);
    }
    params.push(limit);

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const sql = `
      SELECT a.id, a.sport, a.category, a.title, a.summary, a.source_name,
             a.source_url, a.image_url, a.relevance_score, a.published_at
        FROM sport_articles a
        ${where}
       ORDER BY a.published_at DESC, a.relevance_score DESC
       LIMIT $${params.length}`;

    const result = await query(sql, params);
    const items = result.rows.map(formatArticle);
    const nextCursor = items.length === limit
      ? items[items.length - 1].publishedAt
      : null;

    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/sport-feed/track-interaction
exports.trackInteraction = async (req, res, next) => {
  try {
    const { articleId, action } = req.body || {};
    if (!articleId || !/^\d+$/.test(String(articleId))) {
      return res.status(400).json({ error: 'Invalid articleId' });
    }
    if (!['view', 'open', 'save', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    await query(
      `INSERT INTO article_interactions (user_id, article_id, action)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [req.userId, articleId, action]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/sport-feed/_seed — dev-only manual trigger
// Requires header X-Admin-Token to match SPORT_FEED_ADMIN_TOKEN env var.
exports.adminSeed = async (req, res, next) => {
  try {
    const expected = process.env.SPORT_FEED_ADMIN_TOKEN;
    if (!expected) {
      return res.status(503).json({ error: 'Seed endpoint disabled' });
    }
    if (req.headers['x-admin-token'] !== expected) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const userRow = await query('SELECT sport FROM users WHERE id = $1', [req.userId]);
    const sport = userRow.rows[0]?.sport;
    if (!sport) {
      return res.status(400).json({ error: 'User has no sport set' });
    }
    const summary = await ingestForSport(sport);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};
