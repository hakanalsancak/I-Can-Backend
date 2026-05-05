const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Cache suspended/admin lookups for 60s to avoid hitting the DB on every request.
const userMetaCache = new Map();
const META_TTL_MS = 60_000;

async function fetchUserMeta(userId) {
  const cached = userMetaCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const r = await query(
    'SELECT suspended_until, is_admin FROM users WHERE id = $1',
    [userId]
  );
  const data = r.rows[0] || { suspended_until: null, is_admin: false };
  userMetaCache.set(userId, { data, expiresAt: Date.now() + META_TTL_MS });
  return data;
}

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = decoded.userId;

  // Block suspended users from any authenticated endpoint.
  try {
    const meta = await fetchUserMeta(decoded.userId);
    if (meta.suspended_until && new Date(meta.suspended_until).getTime() > Date.now()) {
      return res.status(403).json({
        error: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
        suspendedUntil: meta.suspended_until,
      });
    }
    req.isAdmin = meta.is_admin === true;
  } catch (err) {
    // If the lookup fails, fail open on suspension check — don't block legit users
    // due to a transient DB error. Logged via the error handler.
    console.error('User meta lookup failed:', err.message);
  }
  next();
};

function invalidateUserMetaCache(userId) {
  if (userId) userMetaCache.delete(userId);
}

const optionalAuth = (req, _res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      req.userId = decoded.userId;
    } catch {
      // Token invalid/expired, continue without auth
    }
  }
  next();
};

function requireAdmin(req, res, next) {
  if (req.isAdmin === true) return next();
  return res.status(403).json({ error: 'Forbidden' });
}

module.exports = { authenticate, optionalAuth, requireAdmin, invalidateUserMetaCache };
