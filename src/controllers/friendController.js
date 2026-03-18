const { query, getClient } = require('../config/database');

exports.searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const escaped = q.toLowerCase().replace(/[%_\\]/g, '\\$&');
    const searchTerm = `%${escaped}%`;
    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.sport, u.team, u.position, u.country,
              s.current_streak
       FROM users u
       LEFT JOIN streaks s ON s.user_id = u.id
       WHERE u.id != $1
         AND u.onboarding_completed = TRUE
         AND u.email NOT LIKE '%@ican.seed'
         AND (LOWER(u.username) LIKE $2 ESCAPE '\\' OR LOWER(u.full_name) LIKE $2 ESCAPE '\\')
       ORDER BY
         CASE WHEN LOWER(u.username) = $3 THEN 0 ELSE 1 END,
         u.full_name
       LIMIT 20`,
      [req.userId, searchTerm, q.toLowerCase()]
    );

    const friendships = await query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [req.userId]
    );
    const friendIds = new Set(friendships.rows.map(r => r.friend_id));

    const pending = await query(
      `SELECT receiver_id FROM friend_requests WHERE sender_id = $1 AND status = 'pending'`,
      [req.userId]
    );
    const pendingIds = new Set(pending.rows.map(r => r.receiver_id));

    const incoming = await query(
      `SELECT sender_id FROM friend_requests WHERE receiver_id = $1 AND status = 'pending'`,
      [req.userId]
    );
    const incomingIds = new Set(incoming.rows.map(r => r.sender_id));

    // Search results only expose display info — team/position/country omitted to prevent harvesting
    const users = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      sport: u.sport,
      currentStreak: u.current_streak || 0,
      friendStatus: friendIds.has(u.id) ? 'friends' : pendingIds.has(u.id) ? 'pending' : incomingIds.has(u.id) ? 'incoming' : 'none',
    }));

    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.sendRequest = async (req, res, next) => {
  try {
    const { receiverId } = req.body;
    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver ID is required' });
    }
    if (receiverId === req.userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const receiver = await query('SELECT id FROM users WHERE id = $1', [receiverId]);
    if (receiver.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await query(
      'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2',
      [req.userId, receiverId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already friends' });
    }

    const pendingCheck = await query(
      `SELECT id, sender_id, receiver_id FROM friend_requests
       WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
         AND status = 'pending'`,
      [req.userId, receiverId]
    );
    if (pendingCheck.rows.length > 0) {
      return res.status(409).json({ error: 'A pending request already exists' });
    }

    const result = await query(
      `INSERT INTO friend_requests (sender_id, receiver_id) VALUES ($1, $2) RETURNING *`,
      [req.userId, receiverId]
    );

    res.status(201).json({
      id: result.rows[0].id,
      senderId: result.rows[0].sender_id,
      receiverId: result.rows[0].receiver_id,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Friend request already sent' });
    }
    next(err);
  }
};

exports.respondToRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline' });
    }

    const request = await query(
      `SELECT * FROM friend_requests WHERE id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [id, req.userId]
    );
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const fr = request.rows[0];

    if (action === 'accept') {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2)', [fr.sender_id, fr.receiver_id]);
        await client.query('INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2)', [fr.receiver_id, fr.sender_id]);
        await client.query(`UPDATE friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [id]);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } else {
      await query(`UPDATE friend_requests SET status = 'declined', updated_at = NOW() WHERE id = $1`, [id]);
    }

    res.json({ success: true, action });
  } catch (err) {
    next(err);
  }
};

exports.cancelRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `DELETE FROM friend_requests WHERE id = $1 AND sender_id = $2 AND status = 'pending' RETURNING id`,
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getPendingRequests = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT fr.id, fr.sender_id, fr.created_at,
              u.username, u.full_name, u.sport, u.team, u.position, u.country,
              s.current_streak
       FROM friend_requests fr
       JOIN users u ON u.id = fr.sender_id
       LEFT JOIN streaks s ON s.user_id = fr.sender_id
       WHERE fr.receiver_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [req.userId]
    );

    const requests = result.rows.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      createdAt: r.created_at,
      sender: {
        id: r.sender_id,
        username: r.username,
        fullName: r.full_name,
        sport: r.sport,
        team: r.team,
        position: r.position,
        country: r.country,
        currentStreak: r.current_streak || 0,
      },
    }));

    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.getFriends = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.sport, u.team, u.position, u.country,
              s.current_streak
       FROM friendships f
       JOIN users u ON u.id = f.friend_id
       LEFT JOIN streaks s ON s.user_id = f.friend_id
       WHERE f.user_id = $1
       ORDER BY u.full_name`,
      [req.userId]
    );

    const friends = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      sport: u.sport,
      team: u.team,
      position: u.position,
      country: u.country,
      currentStreak: u.current_streak || 0,
    }));

    res.json(friends);
  } catch (err) {
    next(err);
  }
};

exports.removeFriend = async (req, res, next) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [req.userId, id]);
    await query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [id, req.userId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getFriendProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Only allow viewing own profile or the profile of a confirmed friend
    if (id !== req.userId) {
      const isFriend = await query(
        'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2',
        [req.userId, id]
      );
      if (isFriend.rows.length === 0) {
        return res.status(403).json({ error: 'You can only view profiles of your friends' });
      }
    }

    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.sport, u.team, u.position, u.country,
              u.competition_level, u.mantra,
              s.current_streak, s.longest_streak
       FROM users u
       LEFT JOIN streaks s ON s.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = result.rows[0];

    res.json({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      sport: u.sport,
      team: u.team,
      position: u.position,
      country: u.country,
      competitionLevel: u.competition_level,
      mantra: u.mantra,
      currentStreak: u.current_streak || 0,
      longestStreak: u.longest_streak || 0,
      isFriend: id !== req.userId,
    });
  } catch (err) {
    next(err);
  }
};

exports.checkUsername = async (req, res, next) => {
  try {
    const { username } = req.query;
    if (!username || username.length < 3) {
      return res.json({ available: false, error: 'Username must be at least 3 characters' });
    }

    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      return res.json({ available: false, error: 'Only letters, numbers, dots and underscores allowed' });
    }

    let result;
    if (req.userId) {
      result = await query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username.toLowerCase(), req.userId]
      );
    } else {
      result = await query(
        'SELECT id FROM users WHERE username = $1',
        [username.toLowerCase()]
      );
    }

    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    next(err);
  }
};
