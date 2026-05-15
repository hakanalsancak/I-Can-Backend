const { query } = require('../config/database');

const BASE_COMMUNITY_COUNT = 314;

async function loadState(userId) {
  const [{ rows: countRows }, { rows: memberRows }] = await Promise.all([
    query('SELECT COUNT(*)::int AS joined FROM community_members'),
    query('SELECT 1 FROM community_members WHERE user_id = $1', [userId]),
  ]);
  const joined = countRows[0]?.joined ?? 0;
  return {
    count: BASE_COMMUNITY_COUNT + joined,
    isMember: memberRows.length > 0,
  };
}

// GET /api/community/count
exports.getCount = async (req, res, next) => {
  try {
    const state = await loadState(req.userId);
    res.json(state);
  } catch (err) {
    next(err);
  }
};

// POST /api/community/join
// Idempotent: a user who has already joined gets the same count back.
exports.join = async (req, res, next) => {
  try {
    await query(
      'INSERT INTO community_members (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [req.userId]
    );
    const state = await loadState(req.userId);
    res.json(state);
  } catch (err) {
    next(err);
  }
};
