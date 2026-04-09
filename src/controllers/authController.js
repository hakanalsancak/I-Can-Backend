const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../config/database');
const cloudinary = require('../config/cloudinary');

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

// Pre-computed dummy hash (cost 12) for constant-time login comparison
// Prevents timing attacks that reveal whether an email is registered
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-safe-dummy-value', 12);

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
    profilePhotoUrl: user.profile_photo_url || null,
    onboardingCompleted: user.onboarding_completed,
    height: user.height != null ? Number(user.height) : null,
    weight: user.weight != null ? Number(user.weight) : null,
    hideHeightWeight: user.hide_height_weight || false,
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

    // Basic email format validation
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Password strength requirements
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    if (fullName !== undefined && (typeof fullName !== 'string' || fullName.length > 100)) {
      return res.status(400).json({ error: 'Full name must be a string of 100 characters or less' });
    }

    // Block reserved internal domains used for seed/fake users
    if (email.toLowerCase().endsWith('@ican.seed') || email.toLowerCase().endsWith('@ican.app')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Unable to create account with this email' });
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
    const user = result.rows[0];

    // Always run bcrypt comparison to prevent timing-based user enumeration.
    // When user doesn't exist or has no password, compare against a dummy hash
    // so the response time is indistinguishable from a real comparison.
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Account uses social login' });
    }
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
    let isNewUser = false;

    if (result.rows.length === 0) {
      const name = fullName
        ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
        : null;

      // Check if a user with the same email already exists and link the Apple ID
      if (email) {
        result = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
          await query('UPDATE users SET apple_id = $1 WHERE id = $2', [appleId, result.rows[0].id]);
          result = await query('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
        }
      }

      if (result.rows.length === 0) {
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
        isNewUser = true;
      }
    }

    const user = result.rows[0];
    const tokens = generateTokens(user.id);
    await storeRefreshToken(user.id, tokens.refreshToken);
    const response = await createUserResponse(user, tokens);
    response.isNewUser = isNewUser;
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
    let isNewUser = false;

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
        isNewUser = true;
      }
    }

    const user = result.rows[0];
    const tokens = generateTokens(user.id);
    await storeRefreshToken(user.id, tokens.refreshToken);
    const response = await createUserResponse(user, tokens);
    response.isNewUser = isNewUser;
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
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
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

const VALID_GENDERS = ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'];
const VALID_NOTIFICATION_FREQUENCIES = [0, 1, 2, 3];
const COUNTRY_RE = /^[A-Za-z]{2}$/;
const USERNAME_RE = /^[a-zA-Z0-9._]+$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const MAX_TEXT_LENGTH = 200;

function validateProfileFields({ fullName, age, country, gender, team, position, notificationFrequency, mantra, competitionLevel, primaryGoal, sport, username, height, weight }) {
  if (username !== undefined && username !== null) {
    if (typeof username !== 'string' || username.length < MIN_USERNAME_LENGTH) {
      return 'Username must be at least 3 characters';
    }
    if (username.length > MAX_USERNAME_LENGTH) {
      return `Username must be ${MAX_USERNAME_LENGTH} characters or less`;
    }
    if (!USERNAME_RE.test(username)) {
      return 'Username can only contain letters, numbers, dots and underscores';
    }
  }
  if (fullName !== undefined && fullName !== null && (typeof fullName !== 'string' || fullName.length > 100)) {
    return 'Full name must be a string of 100 characters or less';
  }
  if (age !== undefined && age !== null) {
    const n = Number(age);
    if (!Number.isInteger(n) || n < 5 || n > 120) return 'Age must be an integer between 5 and 120';
  }
  if (country !== undefined && country !== null && !COUNTRY_RE.test(country)) {
    return 'Country must be a 2-letter ISO code';
  }
  if (gender !== undefined && gender !== null && !VALID_GENDERS.includes(gender)) {
    return `Gender must be one of: ${VALID_GENDERS.join(', ')}`;
  }
  if (notificationFrequency !== undefined && notificationFrequency !== null && !VALID_NOTIFICATION_FREQUENCIES.includes(Number(notificationFrequency))) {
    return `Notification frequency must be one of: ${VALID_NOTIFICATION_FREQUENCIES.join(', ')}`;
  }
  for (const [label, val] of [['team', team], ['position', position], ['mantra', mantra], ['competitionLevel', competitionLevel], ['primaryGoal', primaryGoal], ['sport', sport]]) {
    if (val !== undefined && val !== null && (typeof val !== 'string' || val.length > MAX_TEXT_LENGTH)) {
      return `${label} must be a string of ${MAX_TEXT_LENGTH} characters or less`;
    }
  }
  if (height !== undefined && height !== null) {
    const h = Number(height);
    if (isNaN(h) || h < 50 || h > 300) return 'Height must be between 50 and 300 cm';
  }
  if (weight !== undefined && weight !== null) {
    const w = Number(weight);
    if (isNaN(w) || w < 20 || w > 500) return 'Weight must be between 20 and 500 kg';
  }
  return null;
}

exports.completeOnboarding = async (req, res, next) => {
  try {
    const { sport, mantra, notificationFrequency, fullName, age, country, gender, team, competitionLevel, position, primaryGoal, username, height, weight } = req.body;
    if (!sport) {
      return res.status(400).json({ error: 'Sport is required' });
    }

    const fieldError = validateProfileFields({ fullName, age, country, gender, team, position, notificationFrequency, mantra, competitionLevel, primaryGoal, sport, username, height, weight });
    if (fieldError) {
      return res.status(400).json({ error: fieldError });
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
       height = COALESCE($14, height),
       weight = COALESCE($15, weight),
       onboarding_completed = TRUE, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [sport, mantra || null, notificationFrequency ?? 1, req.userId, fullName || null, age || null, country || null,
       gender || null, team || null, competitionLevel || null, position || null, primaryGoal || null,
       username ? username.toLowerCase() : null, height ?? null, weight ?? null]
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
    const { mantra, fullName, age, country, gender, team, competitionLevel, position, primaryGoal, username, sport, height, weight, hideHeightWeight } = req.body;

    const fieldError = validateProfileFields({ fullName, age, country, gender, team, position, mantra, competitionLevel, primaryGoal, sport, username, height, weight });
    if (fieldError) {
      return res.status(400).json({ error: fieldError });
    }

    if (username !== undefined) {
      const existing = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username.toLowerCase(), req.userId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
    }

    // Build dynamic SET clause — only update fields that were explicitly provided
    const updates = [];
    const params = [];
    let paramIdx = 1;

    const fieldMap = {
      mantra: mantra,
      full_name: fullName,
      age: age,
      country: country,
      gender: gender,
      team: team,
      competition_level: competitionLevel,
      position: position,
      primary_goal: primaryGoal,
      sport: sport,
      height: height,
      weight: weight,
      hide_height_weight: hideHeightWeight,
    };

    const colToBodyKey = { full_name: 'fullName', competition_level: 'competitionLevel', primary_goal: 'primaryGoal', hide_height_weight: 'hideHeightWeight' };
    const numericOrBoolCols = new Set(['height', 'weight', 'hide_height_weight', 'age']);
    for (const [col, val] of Object.entries(fieldMap)) {
      if (req.body.hasOwnProperty(colToBodyKey[col] || col)) {
        updates.push(`${col} = $${paramIdx}`);
        params.push(numericOrBoolCols.has(col) ? (val ?? null) : (val || null));
        paramIdx++;
      }
    }

    if (username !== undefined) {
      updates.push(`username = $${paramIdx}`);
      params.push(username ? username.toLowerCase() : null);
      paramIdx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(req.userId);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
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

exports.logoutAll = async (req, res, next) => {
  try {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.userId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.linkApple = async (req, res, next) => {
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

    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (email && !emailVerified) {
      return res.status(400).json({ error: 'Apple account email is not verified' });
    }

    const existing = await query('SELECT id FROM users WHERE apple_id = $1 AND id != $2', [appleId, req.userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This Apple account is already linked to another user' });
    }

    const name = fullName
      ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
      : null;

    const result = await query(
      `UPDATE users SET apple_id = $1, email = COALESCE($2, email),
       full_name = COALESCE($3, full_name), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [appleId, email, name, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUserFields(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.linkGoogle = async (req, res, next) => {
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

    const existing = await query('SELECT id FROM users WHERE google_id = $1 AND id != $2', [googleId, req.userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This Google account is already linked to another user' });
    }

    const result = await query(
      `UPDATE users SET google_id = $1, email = COALESCE($2, email),
       full_name = COALESCE($3, full_name), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [googleId, email, fullName, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUserFields(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { confirmation } = req.body;
    // Support legacy field name
    const confirmValue = confirmation || req.body.username;
    if (!confirmValue) {
      return res.status(400).json({ error: 'Username or email confirmation required' });
    }

    const user = await query('SELECT username, email FROM users WHERE id = $1', [req.userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const matchesUsername = user.rows[0].username && user.rows[0].username === confirmValue.toLowerCase();
    const matchesEmail = user.rows[0].email && user.rows[0].email.toLowerCase() === confirmValue.toLowerCase();
    if (!matchesUsername && !matchesEmail) {
      return res.status(403).json({ error: 'Confirmation does not match your username or email' });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM friend_requests WHERE sender_id = $1 OR receiver_id = $1', [req.userId]);
      await client.query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [req.userId]);
      await client.query('DELETE FROM ai_reports WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM daily_entries WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM streaks WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM subscriptions WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM device_tokens WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM chat_usage WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM notification_log WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM feedback WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM users WHERE id = $1', [req.userId]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    next(err);
  }
};

exports.uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    // Delete old photo from Cloudinary if one exists
    const existing = await query('SELECT profile_photo_url FROM users WHERE id = $1', [req.userId]);
    if (existing.rows.length > 0 && existing.rows[0].profile_photo_url) {
      const oldUrl = existing.rows[0].profile_photo_url;
      const publicId = oldUrl.split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch {
        // Old photo cleanup is best-effort
      }
    }

    // Upload to Cloudinary from memory buffer
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'ican/profile-photos',
          public_id: req.userId,
          overwrite: true,
          transformation: [
            { width: 500, height: 500, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    const result = await query(
      'UPDATE users SET profile_photo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [uploadResult.secure_url, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUserFields(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.deletePhoto = async (req, res, next) => {
  try {
    const existing = await query('SELECT profile_photo_url FROM users WHERE id = $1', [req.userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existing.rows[0].profile_photo_url) {
      try {
        await cloudinary.uploader.destroy(`ican/profile-photos/${req.userId}`);
      } catch {
        // Cloudinary cleanup is best-effort
      }
    }

    await query(
      'UPDATE users SET profile_photo_url = NULL, updated_at = NOW() WHERE id = $1',
      [req.userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
