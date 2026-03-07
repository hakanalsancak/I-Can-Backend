const { query, getClient } = require('../config/database');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

exports.submitEntry = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      entryDate, activityType, focusRating, effortRating,
      confidenceRating, didWell, improveNext,
      rotatingQuestionId, rotatingAnswer,
    } = req.body;

    if (!entryDate || !activityType) {
      return res.status(400).json({ error: 'Entry date and activity type are required' });
    }

    const performanceScore = Math.round((focusRating + effortRating + confidenceRating) / 3);

    const entryResult = await client.query(
      `INSERT INTO daily_entries
       (user_id, entry_date, activity_type, focus_rating, effort_rating,
        confidence_rating, performance_score, did_well, improve_next,
        rotating_question_id, rotating_answer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, entry_date) DO UPDATE SET
         activity_type = EXCLUDED.activity_type,
         focus_rating = EXCLUDED.focus_rating,
         effort_rating = EXCLUDED.effort_rating,
         confidence_rating = EXCLUDED.confidence_rating,
         performance_score = EXCLUDED.performance_score,
         did_well = EXCLUDED.did_well,
         improve_next = EXCLUDED.improve_next,
         rotating_question_id = EXCLUDED.rotating_question_id,
         rotating_answer = EXCLUDED.rotating_answer
       RETURNING *`,
      [
        req.userId, entryDate, activityType, focusRating, effortRating,
        confidenceRating, performanceScore, didWell || null, improveNext || null,
        rotatingQuestionId || null, rotatingAnswer || null,
      ]
    );

    const today = new Date(entryDate).toISOString().split('T')[0];
    const yesterday = new Date(new Date(entryDate).getTime() - 86400000).toISOString().split('T')[0];

    const streakResult = await client.query(
      'SELECT * FROM streaks WHERE user_id = $1',
      [req.userId]
    );

    let streak;
    if (streakResult.rows.length === 0) {
      const inserted = await client.query(
        `INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date, updated_at)
         VALUES ($1, 1, 1, $2, NOW()) RETURNING *`,
        [req.userId, today]
      );
      streak = inserted.rows[0];
    } else {
      streak = streakResult.rows[0];
      const lastDate = streak.last_entry_date
        ? new Date(streak.last_entry_date).toISOString().split('T')[0]
        : null;

      let newStreak = streak.current_streak;
      if (lastDate === today) {
        // Already logged today
      } else if (lastDate === yesterday) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }

      const longestStreak = Math.max(newStreak, streak.longest_streak);
      const updated = await client.query(
        `UPDATE streaks SET current_streak = $1, longest_streak = $2,
         last_entry_date = $3, updated_at = NOW()
         WHERE user_id = $4 RETURNING *`,
        [newStreak, longestStreak, today, req.userId]
      );
      streak = updated.rows[0];
    }

    await client.query('COMMIT');

    const entry = entryResult.rows[0];
    res.status(201).json({
      entry: {
        id: entry.id,
        entryDate: formatDate(entry.entry_date),
        activityType: entry.activity_type,
        focusRating: entry.focus_rating,
        effortRating: entry.effort_rating,
        confidenceRating: entry.confidence_rating,
        performanceScore: entry.performance_score,
        didWell: entry.did_well,
        improveNext: entry.improve_next,
        rotatingQuestionId: entry.rotating_question_id,
        rotatingAnswer: entry.rotating_answer,
      },
      streak: {
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

exports.getEntries = async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 30, offset = 0 } = req.query;

    let sql = 'SELECT * FROM daily_entries WHERE user_id = $1';
    const params = [req.userId];
    let paramIdx = 2;

    if (startDate) {
      sql += ` AND entry_date >= $${paramIdx}`;
      params.push(startDate);
      paramIdx++;
    }
    if (endDate) {
      sql += ` AND entry_date <= $${paramIdx}`;
      params.push(endDate);
      paramIdx++;
    }

    sql += ` ORDER BY entry_date DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    const entries = result.rows.map((e) => ({
      id: e.id,
      entryDate: formatDate(e.entry_date),
      activityType: e.activity_type,
      focusRating: e.focus_rating,
      effortRating: e.effort_rating,
      confidenceRating: e.confidence_rating,
      performanceScore: e.performance_score,
      didWell: e.did_well,
      improveNext: e.improve_next,
      rotatingQuestionId: e.rotating_question_id,
      rotatingAnswer: e.rotating_answer,
      createdAt: e.created_at,
    }));

    res.json({ entries });
  } catch (err) {
    next(err);
  }
};

exports.getEntryByDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    const result = await query(
      'SELECT * FROM daily_entries WHERE user_id = $1 AND entry_date = $2',
      [req.userId, date]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No entry found for this date' });
    }

    const e = result.rows[0];
    res.json({
      id: e.id,
      entryDate: formatDate(e.entry_date),
      activityType: e.activity_type,
      focusRating: e.focus_rating,
      effortRating: e.effort_rating,
      confidenceRating: e.confidence_rating,
      performanceScore: e.performance_score,
      didWell: e.did_well,
      improveNext: e.improve_next,
      rotatingQuestionId: e.rotating_question_id,
      rotatingAnswer: e.rotating_answer,
      createdAt: e.created_at,
    });
  } catch (err) {
    next(err);
  }
};
