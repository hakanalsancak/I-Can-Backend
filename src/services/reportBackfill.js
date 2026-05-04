// Deterministic backfill for legacy reports generated before the v2 schema.
//
// Old reports only contain prose (`summary`, `consistencyAnalysis`, `strengths`,
// etc.) — they have no `overallScore`, no per-pillar scores, no `dailyScores`,
// no `bestDay`/`worstDay`. The new "report card" UI shows "—" for those.
//
// Rather than ignore old reports or run a destructive migration, we compute the
// missing structured fields on the fly from the user's `daily_entries` rows
// covering the report's period and merge them into the response. Pure JS, no
// LLM, runs in single-digit milliseconds per report.

const { query } = require('../config/database');

const isV2Entry = (e) => {
  const r = e.responses;
  return !!(r && (r.version === 2 || Array.isArray(r.completedSections)));
};

function dateKey(d) {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).split('T')[0];
}

function buildDateRange(start, end) {
  const out = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

// Score a single day's entry across the three pillars.
// Returns { training, nutrition, sleep, overall, label } where each pillar is
// 0–100 and `label` is a short "what made it good/bad" string used for the
// best-day/worst-day cards.
function scoreEntry(e) {
  const r = e.responses || {};
  let training = null;
  let nutrition = null;
  let sleep = null;
  const labelBits = [];

  const v2 = isV2Entry(e);

  // ---- Training ----
  if (v2 && r.training && Array.isArray(r.training.sessions) && r.training.sessions.length > 0) {
    const sessions = r.training.sessions;
    if (Number.isFinite(r.training.sessionScore)) {
      training = clamp(r.training.sessionScore);
    } else {
      const scores = sessions
        .map(s => Number.isFinite(s.sessionScore) ? s.sessionScore : (Number.isFinite(s.performanceRating) ? s.performanceRating * 10 : null))
        .filter(v => Number.isFinite(v));
      if (scores.length) {
        training = clamp(avg(scores));
      } else {
        // Fall back to volume + intensity heuristic
        const totalMin = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);
        const intensityMap = { low: 60, medium: 75, high: 88, max: 95 };
        const intensityScores = sessions
          .map(s => intensityMap[String(s.intensity || '').toLowerCase()])
          .filter(Boolean);
        const intensityAvg = intensityScores.length ? avg(intensityScores) : 70;
        const volumeBoost = Math.min(15, totalMin / 12); // up to +15 for ~3h
        training = clamp(intensityAvg + volumeBoost - 10);
      }
    }
    if (sessions.length === 1) labelBits.push(`${sessions[0].trainingType || 'training'}`.replace(/_/g, ' '));
    else labelBits.push(`${sessions.length} sessions`);
  } else if (!v2) {
    // Legacy entries: did they train, did they reflect?
    const did = (r.workedOn && r.workedOn.length) || r.skillImproved || r.hardestDrill || (r.gameStats && Object.keys(r.gameStats).length);
    if (did) {
      training = 70;
      if (r.gameStats && Object.keys(r.gameStats).length) training += 10;
      if (r.bestMoment) training += 5;
      training = clamp(training);
      labelBits.push(r.gameStats && Object.keys(r.gameStats).length ? 'game day' : 'training');
    }
  }

  // ---- Nutrition ----
  if (v2 && r.nutrition) {
    if (Number.isFinite(r.nutrition.healthScore) && r.nutrition.healthScore > 0) {
      nutrition = clamp(r.nutrition.healthScore);
      if (nutrition >= 80) labelBits.push('clean fueling');
      else if (nutrition < 50) labelBits.push('skipped meals');
    } else {
      // Score from completeness alone if no LLM score was stored
      const slots = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'];
      const filled = slots.filter(k => r.nutrition[k] && String(r.nutrition[k]).trim()).length;
      if (filled > 0) {
        nutrition = clamp(40 + filled * 12); // 1=52, 4=88, 5=100
        if (filled <= 1) labelBits.push('meals missed');
      }
    }
  }

  // ---- Sleep ----
  if (v2 && r.sleep && r.sleep.sleepTime && r.sleep.wakeTime) {
    const sp = r.sleep.sleepTime.split(':').map(Number);
    const wp = r.sleep.wakeTime.split(':').map(Number);
    if (sp.length === 2 && wp.length === 2) {
      let diff = (wp[0] * 60 + wp[1]) - (sp[0] * 60 + sp[1]);
      if (diff < 0) diff += 24 * 60;
      const hours = diff / 60;
      // 8h => 100. 7h => 90. 6h => 75. 5h => 55. <4h => 30.
      if (hours >= 8.5) sleep = 100;
      else if (hours >= 8) sleep = 95;
      else if (hours >= 7.5) sleep = 90;
      else if (hours >= 7) sleep = 82;
      else if (hours >= 6.5) sleep = 72;
      else if (hours >= 6) sleep = 62;
      else if (hours >= 5) sleep = 50;
      else sleep = 35;
      if (hours >= 8) labelBits.push(`${Math.round(hours * 10) / 10}h sleep`);
      else if (hours < 6) labelBits.push(`${Math.round(hours * 10) / 10}h sleep`);
    }
  }

  // ---- Overall (weighted, dampened by missing pillars) ----
  const present = [
    [training, 0.5],
    [nutrition, 0.2],
    [sleep, 0.3],
  ].filter(([v]) => Number.isFinite(v));

  if (present.length === 0) {
    return { training: 0, nutrition: 0, sleep: 0, overall: 0, label: 'no data logged' };
  }

  const totalWeight = present.reduce((a, [, w]) => a + w, 0);
  const weighted = present.reduce((a, [v, w]) => a + v * w, 0) / totalWeight;
  // Penalize partial logging — full 3-pillar day gets the full score
  const completenessFactor = 0.7 + 0.3 * (present.length / 3);
  const overall = clamp(weighted * completenessFactor);

  return {
    training: training ?? 0,
    nutrition: nutrition ?? 0,
    sleep: sleep ?? 0,
    overall,
    label: labelBits.slice(0, 2).join(' + ') || 'partial log',
  };
}

function clamp(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function headlineFor(score, prev) {
  const delta = Number.isFinite(prev) ? score - prev : null;
  if (delta !== null && delta < -5) return 'Down ' + Math.abs(delta) + '. Win it back.';
  if (score >= 90) return 'Elite. Match it again.';
  if (score >= 80) return 'You were close to a perfect run.';
  if (score >= 70) return 'Solid. Now sharpen the edges.';
  if (score >= 60) return 'Below your bar. You know it.';
  if (score > 0) return 'Rough stretch. Reset starts now.';
  return 'Show up. Log every day.';
}

// Build a synthetic ReportContent overlay from raw entries for one period.
async function computeOverlay(userId, reportType, periodStart, periodEnd, prevPeriodCache) {
  const entriesResult = await query(
    `SELECT entry_date, responses FROM daily_entries
     WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
     ORDER BY entry_date ASC`,
    [userId, periodStart, periodEnd]
  );

  const allDates = buildDateRange(periodStart, periodEnd);
  const byDate = new Map();
  for (const row of entriesResult.rows) byDate.set(dateKey(row.entry_date), row);

  // Score each day in the period (0 for unlogged days). Note: scoreEntry()
  // returns `overall` not `score` — the unlogged shortcut must match that
  // shape or downstream `dailyScores` end up with undefined values that fail
  // strict Codable decoding on iOS.
  const perDay = allDates.map(d => {
    const e = byDate.get(d);
    if (!e) return { date: d, overall: 0, training: 0, nutrition: 0, sleep: 0, label: 'unlogged' };
    const s = scoreEntry(e);
    return { date: d, ...s };
  });

  const logged = perDay.filter(d => d.overall > 0);
  const overallScore = logged.length ? clamp(avg(logged.map(d => d.overall))) : 0;
  const trainingScore = logged.length ? clamp(avg(logged.map(d => d.training).filter(v => v > 0))) || 0 : 0;
  const nutritionScore = logged.length ? clamp(avg(logged.map(d => d.nutrition).filter(v => v > 0))) || 0 : 0;
  const sleepScore = logged.length ? clamp(avg(logged.map(d => d.sleep).filter(v => v > 0))) || 0 : 0;

  // Best / worst day (only among logged days)
  let bestDay = null, worstDay = null;
  if (logged.length > 0) {
    const sortedHi = [...logged].sort((a, b) => b.overall - a.overall);
    const sortedLo = [...logged].sort((a, b) => a.overall - b.overall);
    bestDay = { date: sortedHi[0].date, score: sortedHi[0].overall, label: sortedHi[0].label };
    if (logged.length >= 2) {
      worstDay = { date: sortedLo[0].date, score: sortedLo[0].overall, label: sortedLo[0].label };
    }
  }

  // Daily scores: weekly = 7, monthly = up to 31
  const dailyScores = perDay.map(d => ({ date: d.date, score: d.overall }));

  // Previous-period overlay for delta + trend
  let prev = null;
  if (prevPeriodCache && prevPeriodCache.has(`${userId}:${reportType}`)) {
    prev = prevPeriodCache.get(`${userId}:${reportType}`);
  } else {
    prev = await computePrevOverlay(userId, reportType, periodStart);
    if (prevPeriodCache) prevPeriodCache.set(`${userId}:${reportType}`, prev);
  }

  const prevOverallScore = prev?.overallScore ?? null;
  const improvementPct = prevOverallScore && prevOverallScore > 0
    ? ((overallScore - prevOverallScore) / prevOverallScore) * 100
    : 0;

  const overlay = {
    overallScore,
    trainingScore,
    nutritionScore,
    sleepScore,
    prevOverallScore,
    prevTrainingScore: prev?.trainingScore ?? null,
    prevNutritionScore: prev?.nutritionScore ?? null,
    prevSleepScore: prev?.sleepScore ?? null,
    improvementPct,
    streakWeeks: 0,           // unknown for legacy reports — leave at 0
    headline: headlineFor(overallScore, prevOverallScore),
    bestDay,
    worstDay,
    dailyScores,
  };

  // Monthly extras: weeklyScores + pillarTrend
  if (reportType === 'monthly') {
    overlay.weeklyScores = buildWeeklyScores(perDay);
    overlay.pillarTrend = buildPillarTrend(
      { trainingScore, nutritionScore, sleepScore },
      prev
    );
  }

  return overlay;
}

// Lightweight previous-period scoring (no recursion, no labels needed)
async function computePrevOverlay(userId, reportType, currentPeriodStart) {
  const prev = computePrevPeriodBounds(reportType, currentPeriodStart);
  if (!prev) return null;
  const result = await query(
    `SELECT entry_date, responses FROM daily_entries
     WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
    [userId, prev.start, prev.end]
  );
  if (result.rows.length === 0) return null;
  const scored = result.rows.map(r => scoreEntry(r));
  const logged = scored.filter(d => d.overall > 0);
  if (logged.length === 0) return null;
  return {
    overallScore: clamp(avg(logged.map(d => d.overall))),
    trainingScore: clamp(avg(logged.map(d => d.training).filter(v => v > 0))) || 0,
    nutritionScore: clamp(avg(logged.map(d => d.nutrition).filter(v => v > 0))) || 0,
    sleepScore: clamp(avg(logged.map(d => d.sleep).filter(v => v > 0))) || 0,
  };
}

function computePrevPeriodBounds(reportType, currentStart) {
  const start = new Date(currentStart + 'T00:00:00Z');
  if (reportType === 'weekly') {
    const prevEnd = new Date(start); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setUTCDate(prevStart.getUTCDate() - 6);
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
  }
  if (reportType === 'monthly') {
    const y = start.getUTCFullYear(), m = start.getUTCMonth();
    const prevStart = new Date(Date.UTC(y, m - 1, 1));
    const prevEnd = new Date(Date.UTC(y, m, 0));
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
  }
  return null;
}

function buildWeeklyScores(perDay) {
  // Group by ISO week, score each as the avg of logged days in that week
  const groups = new Map();
  for (const d of perDay) {
    const date = new Date(d.date + 'T00:00:00Z');
    const week = isoWeek(date);
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(d.overall);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.slice(0, 6).map(([week, scores], idx) => {
    const logged = scores.filter(s => s > 0);
    return {
      weekIndex: idx + 1,
      score: logged.length ? clamp(avg(logged)) : 0,
      label: 'W' + (idx + 1),
    };
  });
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function buildPillarTrend(curr, prev) {
  const pct = (c, p) => (Number.isFinite(p) && p > 0) ? ((c - p) / p) * 100 : 0;
  const noteFor = (delta, name) => {
    if (delta > 5) return name === 'Sleep' ? 'Locked in.' : 'Sharper than last month.';
    if (delta < -5) return name === 'Sleep' ? 'Slipped. Fix this first.' : 'Slipped. Tighten up.';
    return 'Flat. Room to grow.';
  };
  const tPct = pct(curr.trainingScore, prev?.trainingScore);
  const nPct = pct(curr.nutritionScore, prev?.nutritionScore);
  const sPct = pct(curr.sleepScore, prev?.sleepScore);
  return {
    trainingPct: Math.round(tPct),
    nutritionPct: Math.round(nPct),
    sleepPct: Math.round(sPct),
    trainingNote: noteFor(tPct, 'Training'),
    nutritionNote: noteFor(nPct, 'Nutrition'),
    sleepNote: noteFor(sPct, 'Sleep'),
  };
}

// Merge overlay onto stored content. Overlay only fills NULL/undefined fields
// in `content` — never overwrites real data already present in newer reports.
async function applyBackfill(userId, reportType, periodStart, periodEnd, content) {
  if (!content || typeof content !== 'object') content = {};
  // Skip work if the report already has v2 fields (new reports)
  if (Number.isFinite(content.overallScore) && Array.isArray(content.dailyScores) && content.dailyScores.length > 0) {
    return content;
  }
  try {
    const overlay = await computeOverlay(userId, reportType, periodStart, periodEnd);
    return { ...overlay, ...stripUndefined(content), ...overlayMissingOnly(content, overlay) };
  } catch (err) {
    console.error('Report backfill failed:', err.message);
    return content;
  }
}

// Pick overlay values only where content is missing them
function overlayMissingOnly(content, overlay) {
  const out = {};
  for (const [k, v] of Object.entries(overlay)) {
    const existing = content[k];
    const missing = existing === undefined || existing === null ||
      (Array.isArray(existing) && existing.length === 0);
    if (missing && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function stripUndefined(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

module.exports = { applyBackfill, computeOverlay };
