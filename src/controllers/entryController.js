const { query, getClient } = require('../config/database');
const { getClient: getOpenAI } = require('../config/openai');
const { checkPremiumAccess } = require('../services/subscriptionService');
const { incrementalStreak } = require('./streakController');
const { computeHealthScore } = require('../services/nutritionScorer');

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
  // Validate BEFORE acquiring a DB client to avoid leaking open transactions
  const {
    entryDate, activityType, focusRating, effortRating,
    confidenceRating, didWell, improveNext,
    rotatingQuestionId, rotatingAnswer, responses,
  } = req.body;

  if (!entryDate || !activityType) {
    return res.status(400).json({ error: 'Entry date and activity type are required' });
  }

  const VALID_ACTIVITY_TYPES = ['training', 'game', 'rest_day', 'other', 'daily_log'];
  if (!VALID_ACTIVITY_TYPES.includes(activityType)) {
    return res.status(400).json({ error: `Activity type must be one of: ${VALID_ACTIVITY_TYPES.join(', ')}` });
  }

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DATE.test(entryDate)) {
    return res.status(400).json({ error: 'entryDate must be in YYYY-MM-DD format' });
  }

  // Validate and coerce rating fields to numbers
  const focus = Number(focusRating);
  const effort = Number(effortRating);
  const confidence = Number(confidenceRating);
  for (const [label, n] of [['focusRating', focus], ['effortRating', effort], ['confidenceRating', confidence]]) {
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      return res.status(400).json({ error: `${label} must be a number between 1 and 10` });
    }
  }

  // Validate text field lengths
  const MAX_TEXT = 2000;
  for (const [label, val] of [['didWell', didWell], ['improveNext', improveNext], ['rotatingAnswer', rotatingAnswer]]) {
    if (val && (typeof val !== 'string' || val.length > MAX_TEXT)) {
      return res.status(400).json({ error: `${label} must be a string of ${MAX_TEXT} characters or less` });
    }
  }

  // Validate responses JSON size
  if (responses && JSON.stringify(responses).length > 10000) {
    return res.status(400).json({ error: 'responses payload is too large' });
  }

  const performanceScore = Math.round(((focus + effort + confidence) / 3) * 10);

  const client = await getClient();
  try {
    await client.query('BEGIN');

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
        req.userId, entryDate, activityType, focus, effort,
        confidence, performanceScore, didWell || null, improveNext || null,
        rotatingQuestionId || null, rotatingAnswer || null,
        responses ? JSON.stringify(responses) : null,
      ]
    );

    // Fast incremental streak — avoids recursive CTE on every submission
    const currentStreak = await incrementalStreak(client, req.userId);

    // Upsert the streaks row
    const streakResult = await client.query(
      `INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date, updated_at)
       VALUES ($1, $2, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = $2,
         longest_streak = GREATEST(streaks.longest_streak, $2),
         last_entry_date = $3,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, currentStreak, entryDate]
    );
    const streak = streakResult.rows[0];

    await client.query('COMMIT');

    const entry = entryResult.rows[0];

    // Compute and persist nutrition health score if nutrition data is present
    if (responses && responses.nutrition) {
      const hasMeals = ['breakfast', 'lunch', 'dinner'].some(
        m => responses.nutrition[m] && responses.nutrition[m].trim()
      );
      if (hasMeals) {
        try {
          const score = await computeHealthScore(responses.nutrition);
          if (score != null) {
            const storedResponses = typeof entry.responses === 'string'
              ? JSON.parse(entry.responses)
              : entry.responses;
            if (storedResponses && storedResponses.nutrition) {
              storedResponses.nutrition.healthScore = score;
              await query(
                `UPDATE daily_entries SET responses = $1 WHERE id = $2`,
                [JSON.stringify(storedResponses), entry.id]
              );
              entry.responses = storedResponses;
            }
          }
        } catch (scoreErr) {
          // Non-critical — don't fail the submission if scoring fails
          console.error('Health score persistence failed:', scoreErr.message);
        }
      }
    }

    res.status(201).json({
      entry: formatEntry(entry),
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
    const MAX_LIMIT = 100;
    const { startDate, endDate, offset = 0 } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), MAX_LIMIT);

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !ISO_DATE.test(startDate)) {
      return res.status(400).json({ error: 'startDate must be in YYYY-MM-DD format' });
    }
    if (endDate && !ISO_DATE.test(endDate)) {
      return res.status(400).json({ error: 'endDate must be in YYYY-MM-DD format' });
    }

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
    params.push(limit, Math.max(parseInt(offset) || 0, 0));

    const result = await query(sql, params);
    res.json({ entries: result.rows.map(formatEntry) });
  } catch (err) {
    next(err);
  }
};

exports.getEntryByDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }
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

exports.getAnalytics = async (req, res, next) => {
  try {
    const { period } = req.query; // 'week' or 'month'
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    // Use the user's stored timezone so week/month boundaries match their local clock
    const userRow = await query('SELECT timezone FROM users WHERE id = $1', [req.userId]);
    const tz = (userRow.rows[0] && userRow.rows[0].timezone) || 'UTC';

    // Build "now" in the user's timezone using Intl
    const parts = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
    const nowYear = parseInt(parts.year);
    const nowMonth = parseInt(parts.month); // 1-based
    const nowDay = parseInt(parts.day);
    // Reconstruct a UTC Date that represents the user's local date
    const now = new Date(Date.UTC(nowYear, nowMonth - 1, nowDay));

    let startDate, endDate;

    if (period === 'previous_month') {
      startDate = new Date(Date.UTC(nowYear, nowMonth - 2, 1)).toISOString().split('T')[0];
      const lastDay = new Date(Date.UTC(nowYear, nowMonth - 1, 0));
      endDate = lastDay.toISOString().split('T')[0];
    } else if (period === 'month') {
      startDate = new Date(Date.UTC(nowYear, nowMonth - 1, 1)).toISOString().split('T')[0];
      const lastDay = new Date(Date.UTC(nowYear, nowMonth, 0));
      endDate = lastDay.toISOString().split('T')[0];
    } else {
      // Default to week (Monday–Sunday)
      const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
      const diffToMonday = day === 0 ? 6 : day - 1;
      const weekStart = new Date(Date.UTC(nowYear, nowMonth - 1, nowDay - diffToMonday));
      const weekEnd = new Date(Date.UTC(nowYear, nowMonth - 1, nowDay - diffToMonday + 6));
      startDate = weekStart.toISOString().split('T')[0];
      endDate = weekEnd.toISOString().split('T')[0];
    }

    // Get entries in range
    const result = await query(
      `SELECT id, entry_date, activity_type, responses, performance_score, focus_rating, effort_rating, confidence_rating
       FROM daily_entries WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date ASC`,
      [req.userId, startDate, endDate]
    );

    const entries = result.rows;
    let totalDays = 0;
    let trainingSessions = 0;
    let nutritionDays = 0;
    let sleepDays = 0;
    let totalSleepHours = 0;
    let completionSum = 0;
    const dailyData = [];

    // Training aggregates
    let totalTrainingDuration = 0;
    const trainingTypeCount = {};   // e.g. { gym: 3, cardio: 2 }
    const intensityCount = {};      // e.g. { high: 2, medium: 3 }
    let totalSessionCount = 0;

    // Nutrition aggregates
    let breakfastCount = 0;
    let lunchCount = 0;
    let dinnerCount = 0;
    let snacksCount = 0;
    let drinksCount = 0;
    let totalHealthScore = 0;

    // Entries that need a one-time backfill of their health score
    const backfillTasks = []; // { entryId, responses, nutrition, dailyDataIndex }

    function calcSleepHours(sleep) {
      if (!sleep || !sleep.sleepTime || !sleep.wakeTime) return null;
      const sp = (sleep.sleepTime || '').split(':').map(Number);
      const wp = (sleep.wakeTime || '').split(':').map(Number);
      let d = (wp[0] * 60 + (wp[1] || 0)) - (sp[0] * 60 + (sp[1] || 0));
      if (d < 0) d += 24 * 60;
      return Math.round(d / 6) / 10;
    }

    for (const e of entries) {
      const dateStr = formatDate(e.entry_date);
      totalDays++;

      if (e.activity_type === 'daily_log' && e.responses) {
        const r = typeof e.responses === 'string' ? JSON.parse(e.responses) : e.responses;
        const sections = r.completedSections || [];
        completionSum += sections.length;

        const hasTraining = sections.includes('training');
        const hasNutrition = sections.includes('nutrition');
        const hasSleep = sections.includes('sleep');

        // Training detail extraction
        let trainingSessions_day = [];
        let trainingDuration = 0;
        if (hasTraining) {
          trainingSessions++;
          if (r.training && r.training.sessions) {
            for (const s of r.training.sessions) {
              totalSessionCount++;
              trainingDuration += s.duration || 0;
              totalTrainingDuration += s.duration || 0;
              const tType = s.trainingType || 'other';
              trainingTypeCount[tType] = (trainingTypeCount[tType] || 0) + 1;
              const iLevel = s.intensity || 'medium';
              intensityCount[iLevel] = (intensityCount[iLevel] || 0) + 1;
              trainingSessions_day.push({
                type: tType,
                duration: s.duration || 0,
                intensity: iLevel,
                sessionScore: s.sessionScore ?? null,
                result: s.result ?? null,
                winMethod: s.winMethod ?? null,
                performanceRating: s.performanceRating ?? null,
                minutesPlayed: s.minutesPlayed ?? null,
                position: s.position ?? null,
                keyStats: s.keyStats ?? null,
                gymFocus: s.gymFocus ?? null,
                effortLevel: s.effortLevel ?? null,
                exercises: s.exercises ?? null,
                cardioType: s.cardioType ?? null,
                distance: s.distance ?? null,
                pace: s.pace ?? null,
                cardioEffort: s.cardioEffort ?? null,
                skillTrained: s.skillTrained ?? null,
                focusQuality: s.focusQuality ?? null,
                tacticalType: s.tacticalType ?? null,
                understandingLevel: s.understandingLevel ?? null,
                recoveryType: s.recoveryType ?? null,
                notes: s.notes ?? null,
              });
            }
          }
        }

        // Nutrition detail extraction
        let mealsLogged = 0;
        let nutritionDetail = null;
        if (hasNutrition) {
          nutritionDays++;
          if (r.nutrition) {
            const hasBreakfast = !!(r.nutrition.breakfast && r.nutrition.breakfast.trim());
            const hasLunch = !!(r.nutrition.lunch && r.nutrition.lunch.trim());
            const hasDinner = !!(r.nutrition.dinner && r.nutrition.dinner.trim());
            const hasSnacks = !!(r.nutrition.snacks && r.nutrition.snacks.trim());
            const hasDrinks = !!(r.nutrition.drinks && r.nutrition.drinks.trim());
            if (hasBreakfast) { breakfastCount++; mealsLogged++; }
            if (hasLunch) { lunchCount++; mealsLogged++; }
            if (hasDinner) { dinnerCount++; mealsLogged++; }
            if (hasSnacks) snacksCount++;
            if (hasDrinks) drinksCount++;
            // Read persisted health score, or queue for backfill if missing
            const storedScore = r.nutrition.healthScore || 0;
            nutritionDetail = {
              mealsLogged,
              breakfast: hasBreakfast,
              lunch: hasLunch,
              dinner: hasDinner,
              snacks: hasSnacks,
              drinks: hasDrinks,
              healthScore: storedScore,
              breakfastText: hasBreakfast ? r.nutrition.breakfast.trim() : null,
              lunchText: hasLunch ? r.nutrition.lunch.trim() : null,
              dinnerText: hasDinner ? r.nutrition.dinner.trim() : null,
              snacksText: hasSnacks ? r.nutrition.snacks.trim() : null,
              drinksText: hasDrinks ? r.nutrition.drinks.trim() : null,
            };
            totalHealthScore += storedScore;
            // If no stored score, queue a one-time backfill via AI
            if (!r.nutrition.healthScore && mealsLogged > 0) {
              backfillTasks.push({
                entryId: e.id,
                responses: r,
                nutrition: r.nutrition,
                dailyDataIndex: dailyData.length,
              });
            }
          }
        }

        if (hasSleep) {
          sleepDays++;
          if (r.sleep && r.sleep.sleepTime && r.sleep.wakeTime) {
            const sleepParts = r.sleep.sleepTime.split(':').map(Number);
            const wakeParts = r.sleep.wakeTime.split(':').map(Number);
            let sleepMin = sleepParts[0] * 60 + (sleepParts[1] || 0);
            let wakeMin = wakeParts[0] * 60 + (wakeParts[1] || 0);
            let diff = wakeMin - sleepMin;
            if (diff < 0) diff += 24 * 60;
            totalSleepHours += diff / 60;
          }
        }

        dailyData.push({
          date: dateStr,
          completion: sections.length,
          training: hasTraining,
          nutrition: hasNutrition,
          sleep: hasSleep,
          sleepHours: hasSleep ? calcSleepHours(r.sleep) : null,
          sleepTime: hasSleep && r.sleep ? r.sleep.sleepTime || null : null,
          wakeTime: hasSleep && r.sleep ? r.sleep.wakeTime || null : null,
          trainingSessions: trainingSessions_day.length > 0 ? trainingSessions_day : null,
          trainingDuration: hasTraining ? trainingDuration : null,
          nutritionDetail,
        });
      } else {
        // V1 entries count as training
        trainingSessions++;
        completionSum += 1;
        dailyData.push({
          date: dateStr,
          completion: 1,
          training: true,
          nutrition: false,
          sleep: false,
          sleepHours: null,
          trainingSessions: null,
          trainingDuration: null,
          nutritionDetail: null,
        });
      }
    }

    // Backfill health scores for old entries that don't have one yet
    if (backfillTasks.length > 0) {
      try {
        const scores = await Promise.all(
          backfillTasks.map(task => computeHealthScore(task.nutrition))
        );
        for (let i = 0; i < backfillTasks.length; i++) {
          const score = scores[i] || 50;
          const task = backfillTasks[i];
          const idx = task.dailyDataIndex;
          // Update in-memory response
          dailyData[idx].nutritionDetail.healthScore = score;
          totalHealthScore += score;
          // Persist to DB so this only happens once
          task.responses.nutrition.healthScore = score;
          query(
            `UPDATE daily_entries SET responses = $1 WHERE id = $2`,
            [JSON.stringify(task.responses), task.entryId]
          ).catch(err => console.error('Backfill persist failed:', err.message));
        }
      } catch (err) {
        console.error('Nutrition backfill failed:', err.message);
      }
    }

    // Build full date range with blank entries for days without data
    const start = new Date(startDate);
    const end = new Date(endDate);
    const expectedDays = Math.ceil((end - start) / 86400000) + 1;

    const dataByDate = {};
    for (const d of dailyData) {
      dataByDate[d.date] = d;
    }

    const fullDailyData = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().split('T')[0];
      if (dataByDate[dateStr]) {
        fullDailyData.push(dataByDate[dateStr]);
      } else {
        fullDailyData.push({
          date: dateStr,
          completion: 0,
          training: false,
          nutrition: false,
          sleep: false,
          sleepHours: null,
          trainingSessions: null,
          trainingDuration: null,
          nutritionDetail: null,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Build training summary
    const trainingSummary = {
      totalSessions: totalSessionCount,
      totalDuration: totalTrainingDuration,
      avgDuration: totalSessionCount > 0 ? Math.round(totalTrainingDuration / totalSessionCount) : 0,
      typeBreakdown: trainingTypeCount,
      intensityBreakdown: intensityCount,
    };

    // Build nutrition summary
    const nutritionSummary = {
      daysLogged: nutritionDays,
      avgMealsPerDay: nutritionDays > 0 ? Math.round(((breakfastCount + lunchCount + dinnerCount) / nutritionDays) * 10) / 10 : 0,
      avgHealthScore: nutritionDays > 0 ? Math.round(totalHealthScore / nutritionDays) : 0,
      breakfastRate: nutritionDays > 0 ? Math.round((breakfastCount / nutritionDays) * 100) : 0,
      lunchRate: nutritionDays > 0 ? Math.round((lunchCount / nutritionDays) * 100) : 0,
      dinnerRate: nutritionDays > 0 ? Math.round((dinnerCount / nutritionDays) * 100) : 0,
      snacksRate: nutritionDays > 0 ? Math.round((snacksCount / nutritionDays) * 100) : 0,
      drinksRate: nutritionDays > 0 ? Math.round((drinksCount / nutritionDays) * 100) : 0,
    };

    res.json({
      period: period || 'week',
      startDate,
      endDate,
      totalDays,
      expectedDays,
      trainingSessions,
      nutritionDays,
      sleepDays,
      avgSleepHours: sleepDays > 0 ? Math.round((totalSleepHours / sleepDays) * 10) / 10 : null,
      avgCompletion: totalDays > 0 ? Math.round((completionSum / (totalDays * 3)) * 100) : 0,
      consistencyPercent: Math.round((totalDays / expectedDays) * 100),
      trainingSummary,
      nutritionSummary,
      dailyData: fullDailyData,
    });
  } catch (err) {
    next(err);
  }
};

exports.generateInsight = async (req, res, next) => {
  try {
    const isPremium = await checkPremiumAccess(req.userId);
    if (!isPremium) {
      return res.status(403).json({ error: 'Premium subscription required', code: 'PREMIUM_REQUIRED' });
    }

    const {
      activityType, trainingAreas, skillImproved, hardestDrill, commonMistake, tomorrowFocus,
      gameStats, bestMoment, biggestMistake, improveNextGame,
      recoveryActivities, sportStudy, restTomorrowFocus,
      reflectionPositive, reflectionImprove, proudMoment,
      trainingSessions, sessionScore,
      nutrition,
    } = req.body;

    if (!activityType) {
      return res.status(400).json({ error: 'Activity type is required' });
    }

    const VALID_INSIGHT_TYPES = ['Training', 'Game', 'Rest Day', 'Other', 'Daily Log', 'Nutrition Log'];
    if (!VALID_INSIGHT_TYPES.includes(activityType)) {
      return res.status(400).json({ error: `Activity type must be one of: ${VALID_INSIGHT_TYPES.join(', ')}` });
    }

    // Validate string fields
    const MAX_FIELD = 500;
    const stringFields = { skillImproved, hardestDrill, commonMistake, tomorrowFocus, bestMoment, biggestMistake, improveNextGame, sportStudy, restTomorrowFocus, reflectionPositive, reflectionImprove, proudMoment };
    for (const [key, val] of Object.entries(stringFields)) {
      if (val != null && (typeof val !== 'string' || val.length > MAX_FIELD)) {
        return res.status(400).json({ error: `${key} must be a string of ${MAX_FIELD} characters or less` });
      }
    }

    // Validate array fields
    const arrayFields = { trainingAreas, recoveryActivities };
    for (const [key, val] of Object.entries(arrayFields)) {
      if (val != null) {
        if (!Array.isArray(val) || val.length > 10) {
          return res.status(400).json({ error: `${key} must be an array with at most 10 items` });
        }
        if (val.some(item => typeof item !== 'string' || item.length > 100)) {
          return res.status(400).json({ error: `Each item in ${key} must be a string of 100 characters or less` });
        }
      }
    }

    // Validate gameStats
    if (gameStats != null) {
      if (typeof gameStats !== 'object' || Array.isArray(gameStats)) {
        return res.status(400).json({ error: 'gameStats must be an object' });
      }
      const keys = Object.keys(gameStats);
      if (keys.length > 20) {
        return res.status(400).json({ error: 'gameStats must have at most 20 keys' });
      }
      for (const v of Object.values(gameStats)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          return res.status(400).json({ error: 'gameStats values must be finite numbers' });
        }
      }
    }

    // Validate trainingSessions (V2 training log)
    if (trainingSessions != null) {
      if (!Array.isArray(trainingSessions) || trainingSessions.length > 10) {
        return res.status(400).json({ error: 'trainingSessions must be an array with at most 10 items' });
      }
    }

    // Validate nutrition
    if (nutrition != null) {
      if (typeof nutrition !== 'object' || Array.isArray(nutrition)) {
        return res.status(400).json({ error: 'nutrition must be an object' });
      }
      const nStr = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'];
      for (const k of nStr) {
        const v = nutrition[k];
        if (v != null && (typeof v !== 'string' || v.length > MAX_FIELD)) {
          return res.status(400).json({ error: `nutrition.${k} must be a string of ${MAX_FIELD} characters or less` });
        }
      }
      for (const k of ['healthScore', 'mealsLogged']) {
        const v = nutrition[k];
        if (v != null && (typeof v !== 'number' || !Number.isFinite(v))) {
          return res.status(400).json({ error: `nutrition.${k} must be a finite number` });
        }
      }
    }

    let logSummary = `Activity: ${activityType}\n`;

    // V2 Training Sessions (from Daily Log training section)
    if (Array.isArray(trainingSessions) && trainingSessions.length > 0) {
      trainingSessions.forEach((s, i) => {
        logSummary += `\nSession ${i + 1}: ${s.trainingType || 'unknown'}\n`;
        switch (s.trainingType) {
          case 'match':
            if (s.matchType) logSummary += `  Type: ${s.matchType}\n`;
            if (s.result) logSummary += `  Result: ${s.result}\n`;
            if (s.performanceRating) logSummary += `  Performance: ${s.performanceRating}/10\n`;
            if (s.minutesPlayed) logSummary += `  Minutes played: ${s.minutesPlayed}\n`;
            if (s.position) logSummary += `  Position: ${s.position}\n`;
            if (s.keyStats && Object.keys(s.keyStats).length > 0) {
              const stats = Object.entries(s.keyStats).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ');
              if (stats) logSummary += `  Stats: ${stats}\n`;
            }
            break;
          case 'gym':
            if (s.gymFocus) logSummary += `  Focus: ${s.gymFocus}\n`;
            if (s.duration) logSummary += `  Duration: ${s.duration}min\n`;
            if (s.effortLevel) logSummary += `  Effort: ${s.effortLevel}\n`;
            if (Array.isArray(s.exercises) && s.exercises.length > 0) logSummary += `  Exercises: ${s.exercises.join(', ')}\n`;
            break;
          case 'cardio':
            if (s.cardioType) logSummary += `  Type: ${s.cardioType}\n`;
            if (s.distance) logSummary += `  Distance: ${s.distance}km\n`;
            if (s.duration) logSummary += `  Time: ${s.duration}min\n`;
            if (s.pace) logSummary += `  Pace: ${s.pace}\n`;
            if (s.cardioEffort) logSummary += `  Effort: ${s.cardioEffort}\n`;
            break;
          case 'technical':
            if (s.skillTrained) logSummary += `  Skill: ${s.skillTrained}\n`;
            if (s.duration) logSummary += `  Duration: ${s.duration}min\n`;
            if (s.focusQuality) logSummary += `  Focus quality: ${s.focusQuality}\n`;
            break;
          case 'tactical':
            if (s.tacticalType) logSummary += `  Type: ${s.tacticalType}\n`;
            if (s.duration) logSummary += `  Duration: ${s.duration}min\n`;
            if (s.understandingLevel) logSummary += `  Understanding: ${s.understandingLevel}\n`;
            break;
          case 'recovery':
            if (s.recoveryType) logSummary += `  Type: ${s.recoveryType}\n`;
            if (s.duration) logSummary += `  Duration: ${s.duration}min\n`;
            break;
          default:
            if (s.duration) logSummary += `  Duration: ${s.duration}min\n`;
            break;
        }
        if (s.sessionScore) logSummary += `  Session score: ${s.sessionScore}/100\n`;
        if (s.notes) logSummary += `  Notes: ${s.notes.substring(0, 200)}\n`;
      });
      if (sessionScore) logSummary += `Overall session score: ${sessionScore}/100\n`;
    }

    // V1 Training (legacy)
    if (activityType === 'Training') {
      if (trainingAreas && trainingAreas.length) logSummary += `Worked on: ${trainingAreas.join(', ')}\n`;
      if (skillImproved) logSummary += `Skill that improved most: ${skillImproved}\n`;
      if (hardestDrill) logSummary += `Hardest drill: ${hardestDrill}\n`;
      if (commonMistake) logSummary += `Most common mistake: ${commonMistake}\n`;
      if (tomorrowFocus) logSummary += `Tomorrow's focus: ${tomorrowFocus}\n`;
    } else if (activityType === 'Game') {
      if (gameStats && Object.keys(gameStats).length > 0) {
        const statLines = Object.entries(gameStats).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ');
        if (statLines) logSummary += `Stats: ${statLines}\n`;
      }
      if (bestMoment) logSummary += `Best moment: ${bestMoment}\n`;
      if (biggestMistake) logSummary += `Biggest mistake: ${biggestMistake}\n`;
      if (improveNextGame) logSummary += `Improve next game: ${improveNextGame}\n`;
    } else if (activityType === 'Rest Day') {
      if (recoveryActivities && recoveryActivities.length) logSummary += `Recovery: ${recoveryActivities.join(', ')}\n`;
      if (sportStudy) logSummary += `Sport study: ${sportStudy}\n`;
      if (restTomorrowFocus) logSummary += `Tomorrow's focus: ${restTomorrowFocus}\n`;
    }

    if (reflectionPositive) logSummary += `What went well: ${reflectionPositive}\n`;
    if (reflectionImprove) logSummary += `What to improve: ${reflectionImprove}\n`;
    if (proudMoment) logSummary += `Proudest moment: ${proudMoment}\n`;

    if (nutrition && typeof nutrition === 'object') {
      logSummary += `\nNutrition:\n`;
      if (nutrition.healthScore != null) logSummary += `  Health score: ${nutrition.healthScore}/100\n`;
      if (nutrition.mealsLogged != null) logSummary += `  Meals logged: ${nutrition.mealsLogged}\n`;
      if (nutrition.breakfast) logSummary += `  Breakfast: ${nutrition.breakfast.substring(0, 200)}\n`;
      if (nutrition.lunch) logSummary += `  Lunch: ${nutrition.lunch.substring(0, 200)}\n`;
      if (nutrition.dinner) logSummary += `  Dinner: ${nutrition.dinner.substring(0, 200)}\n`;
      if (nutrition.snacks) logSummary += `  Snacks: ${nutrition.snacks.substring(0, 200)}\n`;
      if (nutrition.drinks) logSummary += `  Drinks: ${nutrition.drinks.substring(0, 200)}\n`;
    }

    const isNutrition = activityType === 'Nutrition Log';

    const nutritionPrompt = `You are an elite sports nutrition coach giving blunt, honest feedback to an athlete.

Rules:
- Read the meals the athlete actually ate and comment on specific foods by name.
- If they ate junk food (chips, soda, candy, fast food, fried food, sugary drinks), call it out directly and warn them they will not reach an elite health score if they keep eating it.
- If they ate clean, high-quality whole foods, acknowledge it briefly and tell them to keep it up.
- If meals are missing, tell them exactly which meal to add and what a good version looks like.
- Be direct, coach-like, and a little tough — no soft language, no hedging.
- Never invent foods that are not in the log.
- 25 to 40 words, maximum 3 sentences.
- No quotation marks. Respond with only the insight.`;

    const defaultPrompt = `You are an elite sports performance coach helping athletes improve their mindset, focus, and discipline.

Generate a short coaching insight based strictly on the athlete's log.

Rules:
- Reference the athlete's answers directly.
- Never invent information that is not in the log.
- Highlight one positive behavior.
- Suggest one improvement if possible.
- Write like a real coach speaking to an athlete.
- Keep the response between 12 and 22 words.
- Maximum 2 sentences.
- Be motivational but realistic.
- Do NOT use quotation marks around your response.
- Respond with only the coaching insight, nothing else.`;

    const TIMEOUT_MS = 20_000;
    const openai = getOpenAI();
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: isNutrition ? nutritionPrompt : defaultPrompt },
          { role: 'user', content: `Here is the athlete's daily log:\n\n${logSummary}` },
        ],
        max_tokens: isNutrition ? 120 : 60,
        temperature: 0.7,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Insight generation timed out')), TIMEOUT_MS)),
    ]);

    const insight = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ insight });
  } catch (err) {
    const safeMsg = (err.message || '').replace(/https?:\/\/[^\s]+/g, '[URL]').replace(/sk-[a-zA-Z0-9]+/g, '[KEY]');
    console.error('Insight generation error:', safeMsg);
    res.status(503).json({ error: 'Insight generation temporarily unavailable', insight: '' });
  }
};
