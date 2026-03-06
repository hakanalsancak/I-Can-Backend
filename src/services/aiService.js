const { getClient } = require('../config/openai');
const { query } = require('../config/database');

const SYSTEM_PROMPT = `You are a professional sports performance coach analyzing an athlete's daily performance data.
Your role is to provide structured, actionable coaching feedback.
Be motivational, specific, and reference the athlete's goals when relevant.
Speak directly to the athlete using "you" language.
Keep your tone encouraging but honest — like a trusted coach.
Always respond with valid JSON matching the requested format.`;

function buildUserPrompt(entries, goals, sport, mantra, reportType) {
  const periodLabel = reportType === 'weekly' ? 'week' : reportType === 'monthly' ? 'month' : 'year';

  return JSON.stringify({
    instruction: `Analyze this athlete's ${periodLabel} of performance data and provide coaching feedback.`,
    sport,
    mantra,
    entries: entries.map((e) => ({
      date: e.entry_date,
      activityType: e.activity_type,
      focus: e.focus_rating,
      effort: e.effort_rating,
      confidence: e.confidence_rating,
      performanceScore: e.performance_score,
      didWell: e.did_well,
      toImprove: e.improve_next,
      rotatingAnswer: e.rotating_answer,
    })),
    goals: goals.map((g) => ({
      type: g.goal_type,
      title: g.title,
      description: g.description,
      targetValue: g.target_value,
      currentValue: g.current_value,
      isCompleted: g.is_completed,
    })),
    responseFormat: {
      summary: 'Brief overall assessment (2-3 sentences)',
      strengths: ['Array of identified strengths'],
      areasForImprovement: ['Array of areas to improve'],
      mentalPatterns: 'Analysis of mental/emotional patterns',
      consistencyAnalysis: 'Assessment of training consistency',
      goalProgress: [{ goal: 'Goal title', analysis: 'Progress analysis', recommendation: 'Actionable recommendation' }],
      actionableTips: ['Specific actionable tips for next period'],
      motivationalMessage: 'Closing motivational message referencing their mantra if provided',
    },
  });
}

async function generateReport(userId, reportType, periodStart, periodEnd) {
  const existing = await query(
    `SELECT * FROM ai_reports WHERE user_id = $1 AND report_type = $2
     AND period_start = $3 AND period_end = $4`,
    [userId, reportType, periodStart, periodEnd]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
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

  const goalsResult = await query(
    'SELECT * FROM goals WHERE user_id = $1 AND is_completed = FALSE',
    [userId]
  );

  const userPrompt = buildUserPrompt(
    entriesResult.rows, goalsResult.rows, sport, mantra, reportType
  );

  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 1500,
  });

  const reportContent = JSON.parse(completion.choices[0].message.content);

  const result = await query(
    `INSERT INTO ai_reports (user_id, report_type, period_start, period_end, report_content)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, reportType, periodStart, periodEnd, JSON.stringify(reportContent)]
  );

  return result.rows[0];
}

module.exports = { generateReport };
