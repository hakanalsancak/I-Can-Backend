const { getClient } = require('../config/openai');
const { query } = require('../config/database');

const ROTATING_QUESTIONS = {
  1: 'How focused were you during training today?',
  2: 'Did you give maximum effort today?',
  3: 'How confident did you feel today?',
  4: 'How well did you handle mistakes today?',
  5: 'How disciplined were you today?',
  6: 'How was your energy level today?',
  7: 'Did you follow your training plan today?',
  8: 'What did you learn today?',
  9: 'How prepared did you feel today?',
  10: 'How satisfied are you with today\'s performance?',
};

function buildSystemPrompt(sport, mantra, reportType) {
  const periodLabels = { weekly: 'week', monthly: 'month', yearly: 'year' };
  const periodLabel = periodLabels[reportType] || 'period';

  return `You are an elite sports performance coach — the kind of coach that professional ${sport} athletes pay thousands of dollars to work with. You combine deep expertise in sport psychology, physical performance science, and mental conditioning.

You are analyzing a ${sport} athlete's ${periodLabel} of daily performance journal entries. This athlete trusts you completely and relies on your feedback to get better every single day.

YOUR COACHING PHILOSOPHY:
- You speak directly to the athlete ("you"), like a trusted mentor who has watched every session
- You are honest and specific — never generic. You reference EXACT details from their entries (dates, scores, what they wrote, patterns you see)
- You balance tough love with genuine encouragement. If they had a bad day, acknowledge it but show them the path forward
- You think about both the MENTAL and PHYSICAL side of performance — they are inseparable
- You connect the dots between entries that the athlete might not see themselves
- You treat their personal mantra as sacred — it represents who they want to become

${mantra ? `THE ATHLETE'S PERSONAL MANTRA: "${mantra}" — This is their core identity statement. Reference it naturally when it connects to what you observe in their data. Don't force it, but when their actions align with or contradict this mantra, call it out.` : ''}

CRITICAL RULES:
- NEVER give generic advice like "keep it up" or "stay consistent" without connecting it to specific data points
- ALWAYS quote or paraphrase what the athlete actually wrote in their reflections — show them you read every word
- When you see a rating drop (focus, effort, or confidence), dig into WHY based on the surrounding context
- When you see a rating improve, celebrate it specifically and explain what they did differently
- Look for patterns across days: did rest days help or hurt their next session? Do game days show different mental states than training days?
- If they said something in "what they did well" one day and it shows up in "what to improve" another day, call out that inconsistency constructively
- Track their energy and discipline patterns — these are early warning signs for burnout or breakthrough

RESPONSE FORMAT — You MUST respond with valid JSON matching this exact structure:

{
  "summary": "A powerful 3-4 sentence overview that immediately shows the athlete you understood their ${periodLabel}. Reference specific highs and lows by date. Set the tone for the rest of the report.",

  "strengths": [
    "Each strength must reference specific entries, dates, or patterns. Example: 'On Tuesday your focus hit 9/10 during game day — and your reflection showed exactly why: you wrote that you stayed calm under pressure in the second half. That mental composure is becoming a pattern.'",
    "Include 3-5 strengths, each 2-3 sentences with concrete evidence"
  ],

  "areasForImprovement": [
    "Each area must be specific and actionable, not vague. Reference what the athlete themselves identified. Example: 'You mentioned wanting to improve your first-touch accuracy on Wednesday, and your confidence dipped to 4/10 that day. These are connected — when you doubt your technique, your body tightens up. Here is what to try...'",
    "Include 2-4 areas, each 2-3 sentences with a clear path forward"
  ],

  "mentalPatterns": "A deep 4-6 sentence analysis of their psychological trends. Look at confidence, focus, and how they handle mistakes. Do they bounce back quickly or does one bad day spiral? Are their self-reflections becoming more self-aware over time? How does their mental state differ between training and game days? Reference specific entries.",

  "physicalPatterns": "A 3-5 sentence analysis of their physical performance trends. Look at effort ratings, energy levels, rest day placement, and training load. Are they overtraining? Under-recovering? Is their effort consistent or do they have energy crashes? How do rest days affect their next session's performance?",

  "consistencyAnalysis": "A 3-4 sentence assessment of their discipline and routine. How many days did they log out of the ${periodLabel}? What does their activity type distribution look like (training vs game vs rest)? Is their logging consistent or sporadic? Consistency in showing up is the foundation — analyze it.",

  "growthAreas": [
    {
      "area": "A specific area where the athlete is growing or needs attention",
      "analysis": "2-3 sentences analyzing their progress in this area based on daily entries. Reference concrete evidence from their logs.",
      "recommendation": "1-2 specific, actionable steps they should take this coming ${periodLabel} to improve"
    }
  ],

  "actionableTips": [
    "Each tip must be specific to THIS athlete and THIS ${periodLabel}'s data. Not generic advice. Example: 'Your confidence drops every time you rate your effort below 6. This ${periodLabel === 'week' ? 'next week' : 'next month'}, before every session, spend 2 minutes reviewing what you wrote in your best entry this ${periodLabel} — remind yourself what peak performance feels like for you.'",
    "Include 3-5 tips, each 1-2 sentences"
  ],

  "motivationalMessage": "A personal, powerful closing message (3-4 sentences) that connects their ${periodLabel}'s journey to their bigger picture. Reference their best moment this ${periodLabel} and project forward. If they have a mantra, weave it in naturally. Make them feel seen and fired up for the next ${periodLabel}."
}`;
}

function buildUserPrompt(entries, sport, reportType) {
  const periodLabels = { weekly: 'week', monthly: 'month', yearly: 'year' };
  const periodLabel = periodLabels[reportType] || 'period';
  const totalDays = entries.length;
  const trainingDays = entries.filter(e => e.activity_type === 'training').length;
  const gameDays = entries.filter(e => e.activity_type === 'game').length;
  const restDays = entries.filter(e => e.activity_type === 'rest_day').length;
  const otherDays = entries.filter(e => e.activity_type === 'other').length;

  const avgFocus = (entries.reduce((s, e) => s + (e.focus_rating || 0), 0) / totalDays).toFixed(1);
  const avgEffort = (entries.reduce((s, e) => s + (e.effort_rating || 0), 0) / totalDays).toFixed(1);
  const avgConfidence = (entries.reduce((s, e) => s + (e.confidence_rating || 0), 0) / totalDays).toFixed(1);
  const avgScore = (entries.reduce((s, e) => s + (e.performance_score || 0), 0) / totalDays).toFixed(1);

  let prompt = `ATHLETE'S ${periodLabel.toUpperCase()} DATA — ${sport.toUpperCase()} PLAYER
${'='.repeat(50)}

OVERVIEW: ${totalDays} entries logged (${trainingDays} training, ${gameDays} games, ${restDays} rest days${otherDays > 0 ? `, ${otherDays} other` : ''})
AVERAGES: Focus ${avgFocus}/10 | Effort ${avgEffort}/10 | Confidence ${avgConfidence}/10 | Score ${avgScore}/10

${'='.repeat(50)}
DAY-BY-DAY BREAKDOWN:
${'='.repeat(50)}
`;

  entries.forEach((e, i) => {
    const date = e.entry_date instanceof Date
      ? e.entry_date.toISOString().split('T')[0]
      : String(e.entry_date).split('T')[0];

    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    const r = e.responses || {};

    prompt += `\n--- ${dayName}, ${date} ---\n`;
    prompt += `Activity: ${e.activity_type.replace('_', ' ').toUpperCase()}\n`;

    if (e.activity_type === 'training') {
      const focusLabel = r.focusLabel || `${e.focus_rating}/10`;
      const effortLabel = r.effortLabel || `${e.effort_rating}/10`;
      prompt += `Focus: ${focusLabel} (${e.focus_rating}/10) | Effort: ${effortLabel} (${e.effort_rating}/10) | Score: ${e.performance_score}/10\n`;
      if (r.workedOn && r.workedOn.length > 0) {
        prompt += `Worked on: ${r.workedOn.join(', ')}\n`;
      }
    } else if (e.activity_type === 'game') {
      const feeling = r.preGameFeeling || `Confidence ${e.confidence_rating}/10`;
      const performance = r.overallPerformance || `${e.focus_rating}/10`;
      prompt += `Pre-game mindset: ${feeling} | Overall performance: ${performance} | Score: ${e.performance_score}/10\n`;
      if (r.strongestAreas && r.strongestAreas.length > 0) {
        prompt += `Strongest areas: ${r.strongestAreas.join(', ')}\n`;
      }
    } else if (e.activity_type === 'rest_day') {
      const recovery = r.recoveryQuality || `${e.focus_rating}/10`;
      const discipline = r.discipline || `${e.effort_rating}/10`;
      prompt += `Recovery quality: ${recovery} | Discipline: ${discipline} | Score: ${e.performance_score}/10\n`;
      if (r.restActivities && r.restActivities.length > 0) {
        prompt += `Activities: ${r.restActivities.join(', ')}\n`;
      }
    } else if (e.activity_type === 'other') {
      const feeling = r.otherFeeling || `${e.focus_rating}/10`;
      prompt += `Overall feeling: ${feeling} | Score: ${e.performance_score}/10\n`;
      if (r.otherActivities && r.otherActivities.length > 0) {
        prompt += `Activities: ${r.otherActivities.join(', ')}\n`;
      }
      if (r.otherDescription) {
        prompt += `Description: "${r.otherDescription}"\n`;
      }
    } else {
      prompt += `Ratings: Focus ${e.focus_rating}/10 | Effort ${e.effort_rating}/10 | Confidence ${e.confidence_rating}/10 | Score: ${e.performance_score}/10\n`;
    }

    if (e.did_well) {
      prompt += `What went well: "${e.did_well}"\n`;
    }
    if (e.improve_next) {
      prompt += `What to improve: "${e.improve_next}"\n`;
    }
    if (r.recoveryReflection) {
      prompt += `Recovery reflection: "${r.recoveryReflection}"\n`;
    }
    if (r.rotatingQ && r.rotatingA) {
      prompt += `"${r.rotatingQ}": "${r.rotatingA}"\n`;
    } else if (e.rotating_question_id && e.rotating_answer) {
      const question = ROTATING_QUESTIONS[e.rotating_question_id] || `Question #${e.rotating_question_id}`;
      prompt += `Daily question — "${question}": "${e.rotating_answer}"\n`;
    }
  });

  prompt += `\nAnalyze this data thoroughly. Remember: this athlete is paying for premium coaching. Every word should prove you read their entries carefully and genuinely care about their development as a ${sport} athlete. Be their best coach.`;

  return prompt;
}

async function generateReport(userId, reportType, periodStart, periodEnd) {
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

  const tokenLimits = { weekly: 4000, monthly: 5000, yearly: 6000 };
  const maxTokens = tokenLimits[reportType] || 4000;

  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.75,
    max_tokens: maxTokens,
  });

  const reportContent = JSON.parse(completion.choices[0].message.content);

  const result = await query(
    `INSERT INTO ai_reports (user_id, report_type, period_start, period_end, report_content, entry_count)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, reportType, periodStart, periodEnd, JSON.stringify(reportContent), entriesResult.rows.length]
  );

  return result.rows[0];
}

module.exports = { generateReport };
