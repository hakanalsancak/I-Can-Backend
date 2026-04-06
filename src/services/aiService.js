const { getClient } = require('../config/openai');
const { query } = require('../config/database');

function buildSystemPrompt(sport, mantra, reportType) {
  const periodLabels = { weekly: 'week', monthly: 'month', yearly: 'year' };
  const periodLabel = periodLabels[reportType] || 'period';

  const depthConfig = {
    weekly: {
      summaryLen: '3-4 sentences',
      strengthCount: '3-4', strengthLen: '2-3 sentences',
      improvementCount: '2-3', improvementLen: '2-3 sentences',
      mentalLen: '4-6 sentences',
      physicalLen: '3-5 sentences',
      consistencyLen: '3-4 sentences',
      growthCount: '2-3', growthAnalysisLen: '2-3 sentences', growthRecLen: '1-2 steps',
      tipsCount: '3-5',
      closingLen: '3-4 sentences',
    },
    monthly: {
      summaryLen: '5-7 sentences',
      strengthCount: '4-6', strengthLen: '3-4 sentences',
      improvementCount: '3-5', improvementLen: '3-4 sentences',
      mentalLen: '6-10 sentences',
      physicalLen: '6-8 sentences',
      consistencyLen: '5-7 sentences',
      growthCount: '3-5', growthAnalysisLen: '3-5 sentences', growthRecLen: '2-3 steps',
      tipsCount: '5-7',
      closingLen: '5-6 sentences',
    },
    yearly: {
      summaryLen: '7-10 sentences',
      strengthCount: '5-8', strengthLen: '4-5 sentences',
      improvementCount: '4-6', improvementLen: '4-5 sentences',
      mentalLen: '10-14 sentences',
      physicalLen: '8-12 sentences',
      consistencyLen: '7-10 sentences',
      growthCount: '4-6', growthAnalysisLen: '4-6 sentences', growthRecLen: '3-4 steps',
      tipsCount: '6-10',
      closingLen: '6-8 sentences',
    },
  };

  const d = depthConfig[reportType] || depthConfig.weekly;

  let extraMonthlyInstructions = '';
  if (reportType === 'monthly') {
    extraMonthlyInstructions = `
MONTHLY DEPTH REQUIREMENTS:
- Compare week-over-week trends within the month. Did they start strong and taper off? Build momentum as the month went on?
- Identify the single best day and single worst day of the month — explain why and what can be learned
- Look for recurring mistakes across the entire month — if a mistake appeared 3+ times, it's a systemic issue that needs a plan
- Analyze their training-to-game ratio: are they training enough for the games they play?
- Assess whether their rest days are strategically placed or random
- Their monthly report should feel like a thorough coaching session — the athlete should feel like you studied them deeply`;
  }

  let extraYearlyInstructions = '';
  if (reportType === 'yearly') {
    extraYearlyInstructions = `
YEARLY DEPTH REQUIREMENTS:
- This report is the most important one the athlete will read. It must feel monumental and worth the wait.
- Break the year into phases (early months, mid-year, late months) and describe how the athlete evolved across each phase
- Identify their defining moment of the year — the single entry or game that best represents their growth
- Track long-term stat progressions: compare early-year game performances to late-year ones
- Analyze how their mindset shifted over time — are their reflections more mature, self-aware, or detailed by year's end?
- Look at training focus evolution — did they diversify or specialize? Was it the right call based on game results?
- Assess year-long consistency: how many weeks/months had gaps? Were there burnout periods?
- Connect their mantra to their year-long journey — did they live up to it? How has their relationship with it changed?
- Project forward: based on this year's trajectory, what should next year look like?
- Write this report as if it's a year-end letter from the best coach they've ever had — personal, detailed, inspiring`;
  }

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

DATA YOU WILL RECEIVE:
The athlete may use two different logging formats:

**V1 (Legacy) entries** — categorized as Training, Game, or Rest Day:
- Training days include: areas worked on, skill that improved most, hardest drill, most common mistake, and tomorrow's focus
- Game days include: sport-specific stats (goals, assists, points, etc.), best moment, biggest mistake, and improvement target
- Rest days include: recovery activities, whether they studied their sport, and tomorrow's focus

**V2 (Daily Log) entries** — modular sections that can include any combination of:
- Training: one or more sessions with type (match, gym, cardio, technical, tactical, recovery), duration, intensity, specific details, and notes
- Nutrition: meals logged (breakfast, lunch, dinner, snacks, drinks)
- Sleep: sleep and wake times with calculated duration

- Every day includes: what they did well, what to improve, and their proudest moment
- V2 entries also show which sections were completed (training, nutrition, sleep) — use completion patterns to assess discipline

CRITICAL RULES:
- NEVER give generic advice like "keep it up" or "stay consistent" without connecting it to specific data points
- ALWAYS quote or paraphrase what the athlete actually wrote — show them you read every word
- When analyzing game stats, look for trends across multiple games (improving/declining numbers)
- When they mention the same mistake repeatedly across training days, flag it as a pattern that needs targeted work
- Connect their training focus areas to game performance — are they working on what matters?
- Track rest day discipline — are they recovering properly between intense sessions?
- Look for alignment between "proudest moment" entries and actual performance data
- For V2 daily log entries: analyze training session variety (types, duration, intensity progression), nutrition consistency (how many meals logged, eating patterns), and sleep quality (duration trends, consistency of sleep/wake times)
- Cross-reference V2 section completion patterns — athletes completing all 3 sections (training + nutrition + sleep) consistently show higher discipline
- When both V1 and V2 entries exist in the same period, treat them equally — the athlete transitioned logging formats
${extraMonthlyInstructions}${extraYearlyInstructions}

RESPONSE FORMAT — You MUST respond with valid JSON matching this exact structure:

{
  "summary": "A powerful ${d.summaryLen} overview that immediately shows the athlete you understood their ${periodLabel}. Reference specific highs and lows by date. Set the tone for the rest of the report.",

  "strengths": [
    "Each strength must reference specific entries, dates, or patterns. Include ${d.strengthCount} strengths, each ${d.strengthLen} with concrete evidence from their logs."
  ],

  "areasForImprovement": [
    "Each area must be specific and actionable. Reference what the athlete themselves identified in their reflections. Include ${d.improvementCount} areas, each ${d.improvementLen} with a clear path forward."
  ],

  "mentalPatterns": "A deep ${d.mentalLen} analysis of their psychological trends. Look at their reflections, proudest moments, and how they handle mistakes. Are their self-reflections becoming more self-aware? Do they bounce back from bad games?",

  "physicalPatterns": "A ${d.physicalLen} analysis of their physical performance trends. Look at training areas, game stats progression, rest day placement, and training load. Are they overtraining? Under-recovering?",

  "consistencyAnalysis": "A ${d.consistencyLen} assessment of their discipline and routine. How many days did they log? What does their activity type distribution look like? Is their logging consistent?",

  "growthAreas": [
    {
      "area": "A specific area where the athlete is growing or needs attention — include ${d.growthCount} growth areas",
      "analysis": "${d.growthAnalysisLen} analyzing their progress based on daily entries and stats",
      "recommendation": "${d.growthRecLen} — specific, actionable steps they should take this coming ${periodLabel}"
    }
  ],

  "actionableTips": [
    "Each tip must be specific to THIS athlete and THIS ${periodLabel}'s data. Include ${d.tipsCount} tips, each 1-2 sentences."
  ],

  "motivationalMessage": "A personal, powerful closing message (${d.closingLen}) that connects their ${periodLabel}'s journey to their bigger picture. Reference their best moment and project forward."
}`;
}

function buildUserPrompt(entries, sport, reportType) {
  const periodLabels = { weekly: 'week', monthly: 'month', yearly: 'year' };
  const periodLabel = periodLabels[reportType] || 'period';
  const totalDays = entries.length;
  const trainingDays = entries.filter(e => e.activity_type === 'training').length;
  const gameDays = entries.filter(e => e.activity_type === 'game').length;
  const restDays = entries.filter(e => e.activity_type === 'rest_day').length;
  const dailyLogDays = entries.filter(e => e.activity_type === 'daily_log').length;

  let overviewParts = [];
  if (dailyLogDays > 0) overviewParts.push(`${dailyLogDays} daily logs`);
  if (trainingDays > 0) overviewParts.push(`${trainingDays} training`);
  if (gameDays > 0) overviewParts.push(`${gameDays} games`);
  if (restDays > 0) overviewParts.push(`${restDays} rest days`);

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
    prompt += `Activity: ${e.activity_type.replace('_', ' ').toUpperCase()}\n`;

    if (e.activity_type === 'daily_log' && r.version === 2) {
      // V2 Daily Log — modular sections
      const sections = r.completedSections || [];
      prompt += `Sections completed: ${sections.join(', ') || 'none'}\n`;

      // Training sessions
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

      // Nutrition
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

      // Sleep
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
    } else if (e.activity_type === 'training') {
      if (r.workedOn && r.workedOn.length > 0) {
        prompt += `Worked on: ${r.workedOn.join(', ')}\n`;
      }
      if (r.skillImproved) prompt += `Skill that improved most: "${r.skillImproved}"\n`;
      if (r.hardestDrill) prompt += `Hardest drill: "${r.hardestDrill}"\n`;
      if (r.commonMistake) prompt += `Most common mistake: "${r.commonMistake}"\n`;
      if (r.tomorrowFocus) prompt += `Tomorrow's focus: "${r.tomorrowFocus}"\n`;
      // Legacy support
      if (r.focusLabel) prompt += `Focus: ${r.focusLabel}\n`;
      if (r.effortLabel) prompt += `Effort: ${r.effortLabel}\n`;
    } else if (e.activity_type === 'game') {
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
      // Legacy support
      if (r.strongestAreas && r.strongestAreas.length > 0) {
        prompt += `Strongest areas: ${r.strongestAreas.join(', ')}\n`;
      }
    } else if (e.activity_type === 'rest_day') {
      if (r.recoveryActivities && r.recoveryActivities.length > 0) {
        prompt += `Recovery activities: ${r.recoveryActivities.join(', ')}\n`;
      } else if (r.restActivities && r.restActivities.length > 0) {
        prompt += `Recovery activities: ${r.restActivities.join(', ')}\n`;
      }
      if (r.sportStudy) prompt += `Sport study: ${r.sportStudy}\n`;
      if (r.restTomorrowFocus) prompt += `Tomorrow's focus: "${r.restTomorrowFocus}"\n`;
      // Legacy support
      if (r.recoveryQuality) prompt += `Recovery quality: ${r.recoveryQuality}\n`;
      if (r.discipline) prompt += `Discipline: ${r.discipline}\n`;
    }

    // Universal reflections (new format)
    if (r.didWell) prompt += `What went well: "${r.didWell}"\n`;
    else if (e.did_well) prompt += `What went well: "${e.did_well}"\n`;

    if (r.improveNext) prompt += `What to improve: "${r.improveNext}"\n`;
    else if (e.improve_next) prompt += `What to improve: "${e.improve_next}"\n`;

    if (r.proudMoment) prompt += `Proudest moment: "${r.proudMoment}"\n`;

    // Legacy rotating questions
    if (r.rotatingQ && r.rotatingA) {
      prompt += `"${r.rotatingQ}": "${r.rotatingA}"\n`;
    }
    if (r.recoveryReflection) {
      prompt += `Recovery reflection: "${r.recoveryReflection}"\n`;
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

  const tokenLimits = { weekly: 4000, monthly: 8000, yearly: 12000 };
  const maxTokens = tokenLimits[reportType] || 4000;
  const timeoutMs = { weekly: 60000, monthly: 90000, yearly: 120000 };

  const aiPromise = getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.75,
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

  const result = await query(
    `INSERT INTO ai_reports (user_id, report_type, period_start, period_end, report_content, entry_count)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, reportType, periodStart, periodEnd, JSON.stringify(reportContent), entriesResult.rows.length]
  );

  return result.rows[0];
}

module.exports = { generateReport };
