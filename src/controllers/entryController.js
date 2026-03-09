const { query, getClient } = require('../config/database');
const { getClient: getOpenAI } = require('../config/openai');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

function formatEntry(e) {
  return {
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
    responses: e.responses || null,
    createdAt: e.created_at,
  };
}

exports.submitEntry = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      entryDate, activityType, focusRating, effortRating,
      confidenceRating, didWell, improveNext,
      rotatingQuestionId, rotatingAnswer, responses,
    } = req.body;

    if (!entryDate || !activityType) {
      return res.status(400).json({ error: 'Entry date and activity type are required' });
    }

    const performanceScore = Math.round(((focusRating + effortRating + confidenceRating) / 3) * 10);

    const entryResult = await client.query(
      `INSERT INTO daily_entries
       (user_id, entry_date, activity_type, focus_rating, effort_rating,
        confidence_rating, performance_score, did_well, improve_next,
        rotating_question_id, rotating_answer, responses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id, entry_date) DO UPDATE SET
         activity_type = EXCLUDED.activity_type,
         focus_rating = EXCLUDED.focus_rating,
         effort_rating = EXCLUDED.effort_rating,
         confidence_rating = EXCLUDED.confidence_rating,
         performance_score = EXCLUDED.performance_score,
         did_well = EXCLUDED.did_well,
         improve_next = EXCLUDED.improve_next,
         rotating_question_id = EXCLUDED.rotating_question_id,
         rotating_answer = EXCLUDED.rotating_answer,
         responses = EXCLUDED.responses
       RETURNING *`,
      [
        req.userId, entryDate, activityType, focusRating, effortRating,
        confidenceRating, performanceScore, didWell || null, improveNext || null,
        rotatingQuestionId || null, rotatingAnswer || null,
        responses ? JSON.stringify(responses) : null,
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

    res.status(201).json({
      entry: formatEntry(entryResult.rows[0]),
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
    res.json({ entries: result.rows.map(formatEntry) });
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

    res.json(formatEntry(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.generateInsight = async (req, res, next) => {
  try {
    const {
      activityType, focus, effort, trainingAreas,
      reflectionPositive, reflectionImprove,
      dailyQuestion, dailyAnswer,
      preGameFeeling, overallPerformance, strongestAreas,
      recoveryQuality, restActivities, discipline, recoveryReflection,
    } = req.body;

    if (!activityType) {
      return res.status(400).json({ error: 'Activity type is required' });
    }

    let logSummary = `Activity: ${activityType}\n`;

    if (activityType === 'Training') {
      if (focus) logSummary += `Focus: ${focus}\n`;
      if (effort) logSummary += `Effort: ${effort}\n`;
      if (trainingAreas && trainingAreas.length) logSummary += `Worked on: ${trainingAreas.join(', ')}\n`;
    } else if (activityType === 'Game') {
      if (preGameFeeling) logSummary += `Pre-game feeling: ${preGameFeeling}\n`;
      if (overallPerformance) logSummary += `Overall performance: ${overallPerformance}\n`;
      if (strongestAreas && strongestAreas.length) logSummary += `Strongest areas: ${strongestAreas.join(', ')}\n`;
    } else if (activityType === 'Rest Day') {
      if (recoveryQuality) logSummary += `Recovery quality: ${recoveryQuality}\n`;
      if (restActivities && restActivities.length) logSummary += `Activities: ${restActivities.join(', ')}\n`;
      if (discipline) logSummary += `Discipline: ${discipline}\n`;
    }

    if (reflectionPositive) logSummary += `What went well: ${reflectionPositive}\n`;
    if (reflectionImprove) logSummary += `What to improve: ${reflectionImprove}\n`;
    if (dailyQuestion && dailyAnswer) logSummary += `${dailyQuestion}: ${dailyAnswer}\n`;
    if (recoveryReflection) logSummary += `Recovery reflection: ${recoveryReflection}\n`;

    const systemPrompt = `You are an elite sports performance coach helping athletes improve their mindset, focus, and discipline.

Generate a short coaching insight based strictly on the athlete's log.

Rules:
- Reference the athlete's answers directly.
- Never invent information that is not in the log.
- Highlight one positive behavior.
- Suggest one improvement if possible.
- Write like a real coach speaking to an athlete.
- Keep the response between 20 and 40 words.
- Maximum 3 sentences.
- Be motivational but realistic.
- Do NOT use quotation marks around your response.
- Respond with only the coaching insight, nothing else.`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the athlete's daily log:\n\n${logSummary}` },
      ],
      max_tokens: 100,
      temperature: 0.7,
    });

    const insight = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ insight });
  } catch (err) {
    console.error('Insight generation error:', err.message);
    res.json({ insight: '' });
  }
};
