const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

const MAX_REFRESH_TOKENS_PER_USER = 5;

async function storeRefreshToken(userId, refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
  // Evict oldest tokens beyond the per-user limit
  await query(
    `DELETE FROM refresh_tokens WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM refresh_tokens WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2
     )`,
    [userId, MAX_REFRESH_TOKENS_PER_USER]
  );
}

function formatUserFields(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.full_name,
    age: user.age,
    gender: user.gender,
    sport: user.sport,
    mantra: user.mantra,
    notificationFrequency: user.notification_frequency,
    country: user.country,
    team: user.team,
    competitionLevel: user.competition_level,
    position: user.position,
    primaryGoal: user.primary_goal,
    onboardingCompleted: user.onboarding_completed,
  };
}

async function createUserResponse(user, tokens) {
  return {
    user: formatUserFields(user),
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

    // Block reserved internal domains used for seed/fake users
    if (email.toLowerCase().endsWith('@ican.seed') || email.toLowerCase().endsWith('@ican.app')) {
      return res.status(400).json({ error: 'Invalid email address' });
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

    // Apple sets email_verified as a string "true"/"false" or boolean
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (email && !emailVerified) {
      return res.status(400).json({ error: 'Apple account email is not verified' });
    }

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

    if (!payload.email_verified) {
      return res.status(400).json({ error: 'Google account email is not verified' });
    }

    let result = await query('SELECT * FROM users WHERE google_id = $1', [googleId]);

    if (result.rows.length === 0) {
      result = await query('SELECT * FROM users WHERE email = $1', [email]);

      if (result.rows.length > 0) {
        await query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, result.rows[0].id]);
        result = await query('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
      } else {
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
      }
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
    const { sport, mantra, notificationFrequency, fullName, age, country, gender, team, competitionLevel, position, primaryGoal, username } = req.body;
    if (!sport) {
      return res.status(400).json({ error: 'Sport is required' });
    }

    if (username) {
      const existing = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username.toLowerCase(), req.userId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
    }

    const result = await query(
      `UPDATE users SET sport = $1, mantra = $2, notification_frequency = $3,
       full_name = COALESCE($5, full_name), age = COALESCE($6, age),
       country = COALESCE($7, country),
       gender = COALESCE($8, gender),
       team = COALESCE($9, team),
       competition_level = COALESCE($10, competition_level),
       position = COALESCE($11, position),
       primary_goal = COALESCE($12, primary_goal),
       username = COALESCE($13, username),
       onboarding_completed = TRUE, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [sport, mantra || null, notificationFrequency || 1, req.userId, fullName || null, age || null, country || null,
       gender || null, team || null, competitionLevel || null, position || null, primaryGoal || null,
       username ? username.toLowerCase() : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUserFields(result.rows[0]));
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
    const fields = formatUserFields(user);
    fields.createdAt = user.created_at;
    res.json(fields);
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { mantra, fullName, age, country, gender, team, competitionLevel, position, primaryGoal, username, sport } = req.body;

    if (username !== undefined) {
      const existing = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username.toLowerCase(), req.userId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
    }

    const result = await query(
      `UPDATE users SET
       mantra = COALESCE($1, mantra),
       full_name = COALESCE($2, full_name),
       age = COALESCE($3, age),
       country = COALESCE($5, country),
       gender = COALESCE($6, gender),
       team = COALESCE($7, team),
       competition_level = COALESCE($8, competition_level),
       position = COALESCE($9, position),
       primary_goal = COALESCE($10, primary_goal),
       username = COALESCE($11, username),
       sport = COALESCE($12, sport),
       updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [mantra !== undefined ? (mantra || null) : undefined, fullName || null, age || null, req.userId, country || null,
       gender || null, team || null, competitionLevel || null, position || null, primaryGoal || null,
       username !== undefined ? (username ? username.toLowerCase() : null) : undefined,
       sport || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUserFields(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query(
        'DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2',
        [tokenHash, req.userId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username confirmation required' });
    }

    const user = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.rows[0].username !== username.toLowerCase()) {
      return res.status(403).json({ error: 'Username does not match' });
    }

    await query('DELETE FROM friend_requests WHERE sender_id = $1 OR receiver_id = $1', [req.userId]);
    await query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [req.userId]);
    await query('DELETE FROM ai_reports WHERE user_id = $1', [req.userId]);
    await query('DELETE FROM daily_entries WHERE user_id = $1', [req.userId]);
    await query('DELETE FROM streaks WHERE user_id = $1', [req.userId]);
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.userId]);
    await query('DELETE FROM subscriptions WHERE user_id = $1', [req.userId]);
    await query('DELETE FROM users WHERE id = $1', [req.userId]);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    next(err);
  }
};
