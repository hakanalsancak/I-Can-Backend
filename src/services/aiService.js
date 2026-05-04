const { getClient } = require('../config/openai');
const { query } = require('../config/database');

function buildSystemPrompt(sport, mantra, reportType) {
  const periodLabels = { weekly: 'week', monthly: 'month' };
  const periodLabel = periodLabels[reportType] || 'period';

  // Field-length contract for the new "report card" UI. The athlete sees
  // bullets, a single action, and a short headline — no paragraphs.
  const limits = reportType === 'monthly'
    ? { headlineMax: 60, bulletMax: 60, actionMax: 60, bulletCount: 3, dailyCount: 30, weeklyCount: 5 }
    : { headlineMax: 60, bulletMax: 60, actionMax: 60, bulletCount: 3, dailyCount: 7, weeklyCount: 0 };

  const monthlyExtras = reportType === 'monthly' ? `
- Generate weeklyScores: an array of up to ${limits.weeklyCount} { weekIndex, score, label } items, one per ISO week in the period. label is short like "W1".
- Generate pillarTrend: { trainingPct, nutritionPct, sleepPct } each as the percentage delta vs the prior month (positive or negative integer-ish), and matching one-line notes (≤28 chars each) like "Sharper than March." or "Slipped. Fix this first."
` : `
- pillarTrend may be omitted (weekly).
- weeklyScores may be omitted (weekly).
`;

  return `You are an elite ${sport} performance coach. The athlete trusts you. You speak in short, direct, motivating lines — never paragraphs.

${mantra ? `Their mantra: "${mantra}". Reference it only if it directly fits.` : ''}

PHILOSOPHY:
- Honest. Specific. Reference real data points (dates, scores, what they wrote).
- Tough love + encouragement. If they had a bad ${periodLabel}, say it — then show the path.
- No filler. No "keep it up." Every line earns its place.

DATA YOU RECEIVE:
- V2 daily logs: training sessions (type, duration, intensity, notes), nutrition (meals logged), sleep (sleep/wake, duration).
- Legacy V1 entries: workedOn, skillImproved, gameStats, bestMoment, biggestMistake, didWell, improveNext, proudMoment.
- Use whichever is present. Treat both equally.

OUTPUT — STRICT JSON. Every length limit is a hard cap. Stay UNDER it.

{
  "overallScore": integer 0–100,            // weighted: training 0.5, nutrition 0.2, sleep 0.3, dampened by missing days
  "trainingScore": integer 0–100,
  "nutritionScore": integer 0–100,
  "sleepScore": integer 0–100,
  "prevOverallScore": integer or null,      // estimate from prior period if data exists; null if unknown
  "prevTrainingScore": integer or null,
  "prevNutritionScore": integer or null,
  "prevSleepScore": integer or null,
  "improvementPct": number,                 // (overallScore - prevOverallScore)/prevOverallScore*100, 0 if unknown
  "streakWeeks": integer,                   // consecutive eligible periods including this one; best-effort
  "headline": "≤${limits.headlineMax} chars. Punchy. Like: 'You were close to a perfect week.'",
  "bestDay": { "date": "YYYY-MM-DD", "score": integer, "label": "≤40 chars, e.g. 'Match win + 8h sleep'" },
  "worstDay": { "date": "YYYY-MM-DD", "score": integer, "label": "≤40 chars, e.g. 'Skipped meals, 5h sleep'" },
  "dailyScores": [ { "date": "YYYY-MM-DD", "score": integer 0–100 } ],   // exactly ${limits.dailyCount} items, chronological. Use 0 for unlogged days.
  "strengths": [ "≤${limits.bulletMax} chars" ],          // exactly ${limits.bulletCount} bullets, terse, concrete, reference data
  "areasForImprovement": [ "≤${limits.bulletMax} chars" ],// exactly ${limits.bulletCount} bullets
  "actionableTips": [ "≤${limits.actionMax} chars, ONE imperative sentence" ], // EXACTLY 1 item — the single move
  "motivationalMessage": "≤80 chars, one closing line",
  "summary": "≤140 chars. Treat as a fallback subtitle only.",
  "mentalPatterns": "≤140 chars",
  "physicalPatterns": "≤140 chars",
  "consistencyAnalysis": "≤140 chars"${monthlyExtras.trim() ? ',' : ''}
${monthlyExtras.trim() ? `  "weeklyScores": [ { "weekIndex": integer, "score": integer 0–100, "label": "W1" } ],
  "pillarTrend": {
    "trainingPct": number, "nutritionPct": number, "sleepPct": number,
    "trainingNote": "≤28 chars", "nutritionNote": "≤28 chars", "sleepNote": "≤28 chars"
  }` : ''}
}

CRITICAL:
- Stay under every char/array limit. Truncate rather than overflow.
- bestDay/worstDay must point to real dates inside the period.
- If a pillar has zero data, score it 0 and say so in the matching bullet.
- Never write paragraphs. The UI is bullets + scores.
${reportType === 'monthly' ? '- Look for week-over-week trend across the month. Project forward in the headline.' : '- Identify the single move that would have moved the score the most. Put it in actionableTips.'}`;
}

function buildUserPrompt(entries, sport, reportType) {
  const periodLabels = { weekly: 'week', monthly: 'month' };
  const periodLabel = periodLabels[reportType] || 'period';
  const totalDays = entries.length;
  const isV2Entry = (e) => {
    const r = e.responses;
    return r && (r.version === 2 || Array.isArray(r.completedSections));
  };
  const dailyLogDays = entries.filter(isV2Entry).length;
  const legacyDays = totalDays - dailyLogDays;

  let overviewParts = [];
  if (dailyLogDays > 0) overviewParts.push(`${dailyLogDays} daily logs`);
  if (legacyDays > 0) overviewParts.push(`${legacyDays} legacy entries`);

  let prompt = `ATHLETE'S ${periodLabel.toUpperCase()} DATA — ${sport.toUpperCase()} PLAYER
${'='.repeat(50)}

OVERVIEW: ${totalDays} entries logged (${overviewParts.join(', ')})

${'='.repeat(50)}
DAY-BY-DAY BREAKDOWN:
${'='.repeat(50)}
`;

  entries.forEach((e) => {
    const date = e.entry_date instanceof Date
      ? e.entry_date.toISOString().split('T')[0]
      : String(e.entry_date).split('T')[0];

    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    const r = e.responses || {};

    prompt += `\n--- ${dayName}, ${date} ---\n`;

    const entryIsV2 = r && (r.version === 2 || Array.isArray(r.completedSections));
    if (entryIsV2) {
      const sections = r.completedSections || [];
      prompt += `Sections completed: ${sections.join(', ') || 'none'}\n`;

      if (r.training && r.training.sessions && r.training.sessions.length > 0) {
        prompt += `Training (${r.training.sessions.length} session${r.training.sessions.length > 1 ? 's' : ''}, total ${r.training.sessions.reduce((sum, s) => sum + (s.duration || 0), 0)}min):\n`;
        r.training.sessions.forEach((session, i) => {
          const type = session.trainingType ? session.trainingType.replace(/_/g, ' ') : 'unknown';
          prompt += `  Session ${i + 1}: ${type} — ${session.duration || 0}min, intensity: ${session.intensity || 'unknown'}`;
          if (session.details && session.details.length > 0) {
            prompt += ` [${session.details.join(', ')}]`;
          }
          prompt += '\n';
          if (session.notes) prompt += `    Notes: "${session.notes}"\n`;
        });
      }

      if (r.nutrition) {
        const meals = [];
        if (r.nutrition.breakfast) meals.push(`Breakfast: ${r.nutrition.breakfast}`);
        if (r.nutrition.lunch) meals.push(`Lunch: ${r.nutrition.lunch}`);
        if (r.nutrition.dinner) meals.push(`Dinner: ${r.nutrition.dinner}`);
        if (r.nutrition.snacks) meals.push(`Snacks: ${r.nutrition.snacks}`);
        if (r.nutrition.drinks) meals.push(`Drinks: ${r.nutrition.drinks}`);
        if (meals.length > 0) {
          prompt += `Nutrition (${meals.length} item${meals.length > 1 ? 's' : ''} logged):\n`;
          meals.forEach(m => { prompt += `  ${m}\n`; });
        }
      }

      if (r.sleep) {
        let sleepLine = `Sleep: ${r.sleep.sleepTime || '?'} → ${r.sleep.wakeTime || '?'}`;
        if (r.sleep.sleepTime && r.sleep.wakeTime) {
          const sleepParts = r.sleep.sleepTime.split(':').map(Number);
          const wakeParts = r.sleep.wakeTime.split(':').map(Number);
          if (sleepParts.length === 2 && wakeParts.length === 2) {
            let diffMin = (wakeParts[0] * 60 + wakeParts[1]) - (sleepParts[0] * 60 + sleepParts[1]);
            if (diffMin < 0) diffMin += 24 * 60;
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            sleepLine += ` (${hours}h${mins > 0 ? ` ${mins}m` : ''})`;
          }
        }
        prompt += `${sleepLine}\n`;
      }
    } else {
      if (r.workedOn && r.workedOn.length > 0) prompt += `Worked on: ${r.workedOn.join(', ')}\n`;
      if (r.skillImproved) prompt += `Skill that improved most: "${r.skillImproved}"\n`;
      if (r.hardestDrill) prompt += `Hardest drill: "${r.hardestDrill}"\n`;
      if (r.commonMistake) prompt += `Most common mistake: "${r.commonMistake}"\n`;
      if (r.tomorrowFocus) prompt += `Tomorrow's focus: "${r.tomorrowFocus}"\n`;
      if (r.focusLabel) prompt += `Focus: ${r.focusLabel}\n`;
      if (r.effortLabel) prompt += `Effort: ${r.effortLabel}\n`;
      if (r.gameStats && Object.keys(r.gameStats).length > 0) {
        const statLines = Object.entries(r.gameStats)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim()}: ${v}`)
          .join(', ');
        if (statLines) prompt += `Stats: ${statLines}\n`;
      }
      if (r.bestMoment) prompt += `Best moment: "${r.bestMoment}"\n`;
      if (r.biggestMistake) prompt += `Biggest mistake: "${r.biggestMistake}"\n`;
      if (r.improveNextGame) prompt += `Improve next game: "${r.improveNextGame}"\n`;
      if (r.strongestAreas && r.strongestAreas.length > 0) prompt += `Strongest areas: ${r.strongestAreas.join(', ')}\n`;
      if (r.recoveryActivities && r.recoveryActivities.length > 0) prompt += `Recovery activities: ${r.recoveryActivities.join(', ')}\n`;
      else if (r.restActivities && r.restActivities.length > 0) prompt += `Recovery activities: ${r.restActivities.join(', ')}\n`;
      if (r.sportStudy) prompt += `Sport study: ${r.sportStudy}\n`;
      if (r.restTomorrowFocus) prompt += `Tomorrow's focus: "${r.restTomorrowFocus}"\n`;
      if (r.recoveryQuality) prompt += `Recovery quality: ${r.recoveryQuality}\n`;
      if (r.discipline) prompt += `Discipline: ${r.discipline}\n`;
    }

    if (r.didWell) prompt += `What went well: "${r.didWell}"\n`;
    if (r.improveNext) prompt += `What to improve: "${r.improveNext}"\n`;
    if (r.proudMoment) prompt += `Proudest moment: "${r.proudMoment}"\n`;
    if (r.rotatingQ && r.rotatingA) prompt += `"${r.rotatingQ}": "${r.rotatingA}"\n`;
    if (r.recoveryReflection) prompt += `Recovery reflection: "${r.recoveryReflection}"\n`;
  });

  prompt += `\nGenerate the JSON report card now. Hard caps on every length. Bullets only. Score every pillar. One action.`;
  return prompt;
}

async function generateReport(userId, reportType, periodStart, periodEnd) {
  if (reportType !== 'weekly' && reportType !== 'monthly') {
    throw new Error(`Unsupported report type: ${reportType}`);
  }

  const userResult = await query('SELECT sport, mantra FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) throw new Error('User not found');
  const { sport, mantra } = userResult.rows[0];

  const entriesResult = await query(
    `SELECT * FROM daily_entries WHERE user_id = $1
     AND entry_date >= $2 AND entry_date <= $3
     ORDER BY entry_date ASC`,
    [userId, periodStart, periodEnd]
  );

  if (entriesResult.rows.length === 0) {
    throw new Error('No entries found for this period');
  }

  const systemPrompt = buildSystemPrompt(sport || 'general', mantra, reportType);
  const userPrompt = buildUserPrompt(entriesResult.rows, sport || 'general', reportType);

  const tokenLimits = { weekly: 2400, monthly: 3600 };
  const timeoutMs = { weekly: 60000, monthly: 90000 };
  const maxTokens = tokenLimits[reportType] || 2400;

  const aiPromise = getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: maxTokens,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`OpenAI report generation timed out after ${(timeoutMs[reportType] || 60000) / 1000}s`)), timeoutMs[reportType] || 60000)
  );

  const completion = await Promise.race([aiPromise, timeoutPromise]);

  let reportContent;
  try {
    reportContent = JSON.parse(completion.choices[0].message.content);
  } catch {
    throw new Error('AI returned invalid JSON for report');
  }

  // Server-side enforcement: clamp arrays + truncate strings so a misbehaving
  // model can't break the UI's tight layouts.
  reportContent = sanitizeReportContent(reportContent, reportType);

  const result = await query(
    `INSERT INTO ai_reports (user_id, report_type, period_start, period_end, report_content, entry_count)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, reportType, periodStart, periodEnd, JSON.stringify(reportContent), entriesResult.rows.length]
  );

  return result.rows[0];
}

function sanitizeReportContent(c, reportType) {
  if (!c || typeof c !== 'object') return c;
  const trim = (s, n) => (typeof s === 'string' ? s.slice(0, n) : s);
  const intOrNull = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

  c.overallScore = intOrNull(c.overallScore);
  c.trainingScore = intOrNull(c.trainingScore);
  c.nutritionScore = intOrNull(c.nutritionScore);
  c.sleepScore = intOrNull(c.sleepScore);
  c.prevOverallScore = Number.isFinite(c.prevOverallScore) ? Math.max(0, Math.min(100, Math.round(c.prevOverallScore))) : null;
  c.prevTrainingScore = Number.isFinite(c.prevTrainingScore) ? Math.max(0, Math.min(100, Math.round(c.prevTrainingScore))) : null;
  c.prevNutritionScore = Number.isFinite(c.prevNutritionScore) ? Math.max(0, Math.min(100, Math.round(c.prevNutritionScore))) : null;
  c.prevSleepScore = Number.isFinite(c.prevSleepScore) ? Math.max(0, Math.min(100, Math.round(c.prevSleepScore))) : null;
  c.improvementPct = Number.isFinite(c.improvementPct) ? c.improvementPct : 0;
  c.streakWeeks = Number.isFinite(c.streakWeeks) ? Math.max(0, Math.round(c.streakWeeks)) : 0;
  c.headline = trim(c.headline, 80);

  const trimDay = (d) => d && typeof d === 'object' ? { date: trim(d.date, 10), score: intOrNull(d.score) ?? 0, label: trim(d.label, 60) } : null;
  c.bestDay = trimDay(c.bestDay);
  c.worstDay = trimDay(c.worstDay);

  const dailyCap = reportType === 'monthly' ? 31 : 7;
  if (Array.isArray(c.dailyScores)) {
    c.dailyScores = c.dailyScores.slice(0, dailyCap).map(d => ({
      date: trim(d?.date, 10),
      score: Number.isFinite(d?.score) ? Math.max(0, Math.min(100, Math.round(d.score))) : 0,
    }));
  }

  if (reportType === 'monthly' && Array.isArray(c.weeklyScores)) {
    c.weeklyScores = c.weeklyScores.slice(0, 6).map(w => ({
      weekIndex: Number.isFinite(w?.weekIndex) ? w.weekIndex : 0,
      score: intOrNull(w?.score) ?? 0,
      label: trim(w?.label, 8),
    }));
  } else if (reportType !== 'monthly') {
    delete c.weeklyScores;
  }

  if (reportType === 'monthly' && c.pillarTrend && typeof c.pillarTrend === 'object') {
    c.pillarTrend = {
      trainingPct: Number.isFinite(c.pillarTrend.trainingPct) ? c.pillarTrend.trainingPct : 0,
      nutritionPct: Number.isFinite(c.pillarTrend.nutritionPct) ? c.pillarTrend.nutritionPct : 0,
      sleepPct: Number.isFinite(c.pillarTrend.sleepPct) ? c.pillarTrend.sleepPct : 0,
      trainingNote: trim(c.pillarTrend.trainingNote, 32),
      nutritionNote: trim(c.pillarTrend.nutritionNote, 32),
      sleepNote: trim(c.pillarTrend.sleepNote, 32),
    };
  } else if (reportType !== 'monthly') {
    delete c.pillarTrend;
  }

  if (Array.isArray(c.strengths)) c.strengths = c.strengths.slice(0, 3).map(s => trim(s, 70));
  if (Array.isArray(c.areasForImprovement)) c.areasForImprovement = c.areasForImprovement.slice(0, 3).map(s => trim(s, 70));
  if (Array.isArray(c.actionableTips)) c.actionableTips = c.actionableTips.slice(0, 1).map(s => trim(s, 70));

  c.motivationalMessage = trim(c.motivationalMessage, 100);
  c.summary = trim(c.summary, 180);
  c.mentalPatterns = trim(c.mentalPatterns, 180);
  c.physicalPatterns = trim(c.physicalPatterns, 180);
  c.consistencyAnalysis = trim(c.consistencyAnalysis, 180);

  return c;
}

module.exports = { generateReport };
