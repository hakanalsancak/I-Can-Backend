const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

async function storeRefreshToken(userId, refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
}

async function createUserResponse(user, tokens) {
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      sport: user.sport,
      mantra: user.mantra,
      notificationFrequency: user.notification_frequency,
      onboardingCompleted: user.onboarding_completed,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

exports.register = async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3) RETURNING *`,
      [email, passwordHash, fullName || null]
    );

    const user = result.rows[0];
    await query(
      'INSERT INTO streaks (user_id, current_streak, longest_streak) VALUES ($1, 0, 0)',
      [user.id]
    );
    await query(
      `INSERT INTO subscriptions (user_id, status, trial_start, trial_end)
       VALUES ($1, 'trial', NOW(), NOW() + INTERVAL '30 days')`,
      [user.id]
    );

    const tokens = generateTokens(user.id);
    await storeRefreshToken(user.id, tokens.refreshToken);
    const response = await createUserResponse(user, tokens);
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Account uses social login' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = generateTokens(user.id);
    await storeRefreshToken(user.id, tokens.refreshToken);
    const response = await createUserResponse(user, tokens);
    res.json(response);
  } catch (err) {
    next(err);
  }
};

exports.appleSignIn = async (req, res, next) => {
  try {
    const { identityToken, fullName } = req.body;
    if (!identityToken) {
      return res.status(400).json({ error: 'Identity token is required' });
    }

    const appleSignin = require('apple-signin-auth');
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });

    const appleId = payload.sub;
    const email = payload.email;

    let result = await query('SELECT * FROM users WHERE apple_id = $1', [appleId]);

    if (result.rows.length === 0) {
      const name = fullName
        ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
        : null;

      result = await query(
        `INSERT INTO users (apple_id, email, full_name)
         VALUES ($1, $2, $3) RETURNING *`,
        [appleId, email, name]
      );

      const user = result.rows[0];
      await query(
        'INSERT INTO streaks (user_id, current_streak, longest_streak) VALUES ($1, 0, 0)',
        [user.id]
      );
      await query(
        `INSERT INTO subscriptions (user_id, status, trial_start, trial_end)
         VALUES ($1, 'trial', NOW(), NOW() + INTERVAL '30 days')`,
        [user.id]
      );
    }

    const user = result.rows[0];
    const tokens = generateTokens(user.id);
    await storeRefreshToken(user.id, tokens.refreshToken);
    const response = await createUserResponse(user, tokens);
    res.json(response);
  } catch (err) {
    next(err);
  }
};

exports.googleSignIn = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const googleId = payload.sub;
    const email = payload.email;
    const fullName = payload.name;

    let result = await query('SELECT * FROM users WHERE google_id = $1', [googleId]);

    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO users (google_id, email, full_name)
         VALUES ($1, $2, $3) RETURNING *`,
        [googleId, email, fullName]
      );

      const user = result.rows[0];
      await query(
        'INSERT INTO streaks (user_id, current_streak, longest_streak) VALUES ($1, 0, 0)',
        [user.id]
      );
      await query(
        `INSERT INTO subscriptions (user_id, status, trial_start, trial_end)
         VALUES ($1, 'trial', NOW(), NOW() + INTERVAL '30 days')`,
        [user.id]
      );
    }

    const user = result.rows[0];
    const tokens = generateTokens(user.id);
    await storeRefreshToken(user.id, tokens.refreshToken);
    const response = await createUserResponse(user, tokens);
    res.json(response);
  } catch (err) {
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await query(
      'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()',
      [tokenHash, decoded.userId]
    );

    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

    const tokens = generateTokens(decoded.userId);
    await storeRefreshToken(decoded.userId, tokens.refreshToken);

    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    next(err);
  }
};

exports.completeOnboarding = async (req, res, next) => {
  try {
    const { sport, mantra, notificationFrequency } = req.body;
    if (!sport) {
      return res.status(400).json({ error: 'Sport is required' });
    }

    const result = await query(
      `UPDATE users SET sport = $1, mantra = $2, notification_frequency = $3,
       onboarding_completed = TRUE, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [sport, mantra || null, notificationFrequency || 1, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      sport: user.sport,
      mantra: user.mantra,
      notificationFrequency: user.notification_frequency,
      onboardingCompleted: user.onboarding_completed,
    });
  } catch (err) {
    next(err);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      sport: user.sport,
      mantra: user.mantra,
      notificationFrequency: user.notification_frequency,
      onboardingCompleted: user.onboarding_completed,
      createdAt: user.created_at,
    });
  } catch (err) {
    next(err);
  }
};
