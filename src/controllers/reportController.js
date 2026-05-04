const { query } = require('../config/database');
const { checkPremiumAccess } = require('../services/subscriptionService');
const { applyBackfill } = require('../services/reportBackfill');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

// Resolve the user's local date components from their stored timezone
function getUserLocalDate(tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month), // 1-based
    day: parseInt(parts.day),
  };
}

function getCurrentWeekBounds(tz) {
  const { year, month, day } = getUserLocalDate(tz);
  const now = new Date(Date.UTC(year, month - 1, day));
  const dow = now.getUTCDay(); // 0=Sun
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(year, month - 1, day - diffToMonday));
  const sunday = new Date(Date.UTC(year, month - 1, day - diffToMonday + 6));
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
    daysRemaining: Math.max(0, Math.ceil((sunday - now) / 86400000)),
  };
}

function getCurrentMonthBounds(tz) {
  const { year, month, day } = getUserLocalDate(tz);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0));
  return {
    start,
    end: lastDay.toISOString().split('T')[0],
    daysRemaining: Math.max(0, lastDay.getUTCDate() - day),
  };
}

exports.getStatus = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Use the user's stored timezone so period boundaries match their local clock
    const userRow = await query('SELECT timezone FROM users WHERE id = $1', [userId]);
    const tz = (userRow.rows[0] && userRow.rows[0].timezone) || 'UTC';

    const week = getCurrentWeekBounds(tz);
    const month = getCurrentMonthBounds(tz);

    const [counts, reports] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE entry_date >= $2 AND entry_date <= $3) AS week_cnt,
           COUNT(*) FILTER (WHERE entry_date >= $4 AND entry_date <= $5) AS month_cnt
         FROM daily_entries WHERE user_id = $1`,
        [userId, week.start, week.end, month.start, month.end]
      ),
      query(
        `SELECT report_type, id FROM ai_reports
         WHERE user_id = $1 AND (
           (report_type = 'weekly'  AND period_start = $2 AND period_end = $3) OR
           (report_type = 'monthly' AND period_start = $4 AND period_end = $5)
         )`,
        [userId, week.start, week.end, month.start, month.end]
      ),
    ]);

    const c = counts.rows[0];
    const reportMap = {};
    for (const r of reports.rows) reportMap[r.report_type] = r.id;

    res.json({
      weekly: {
        periodStart: week.start,
        periodEnd: week.end,
        entryCount: parseInt(c.week_cnt),
        requiredEntries: 3,
        daysRemaining: week.daysRemaining,
        reportReady: !!reportMap.weekly,
        reportId: reportMap.weekly || null,
      },
      monthly: {
        periodStart: month.start,
        periodEnd: month.end,
        entryCount: parseInt(c.month_cnt),
        requiredEntries: 10,
        daysRemaining: month.daysRemaining,
        reportReady: !!reportMap.monthly,
        reportId: reportMap.monthly || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getReports = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, report_type, period_start, period_end, report_content, entry_count, created_at
       FROM ai_reports WHERE user_id = $1
       ORDER BY period_end DESC, created_at DESC LIMIT 50`,
      [req.userId]
    );

    // Backfill scores for the most recent N reports of each type so the hero
    // card and "Last 4 reports" chips render correctly for legacy reports.
    // Older list rows return as-is — small chips just show "—".
    const HERO_BACKFILL_LIMIT = 4;
    const seenByType = { weekly: 0, monthly: 0 };

    const reports = await Promise.all(result.rows.map(async (r) => {
      const periodStart = formatDate(r.period_start);
      const periodEnd = formatDate(r.period_end);
      let content = r.report_content;
      const type = r.report_type;

      if ((type === 'weekly' || type === 'monthly') && seenByType[type] < HERO_BACKFILL_LIMIT) {
        seenByType[type]++;
        content = await applyBackfill(req.userId, type, periodStart, periodEnd, content);
      }

      return {
        id: r.id,
        reportType: type,
        periodStart,
        periodEnd,
        content,
        entryCount: r.entry_count,
        createdAt: r.created_at,
      };
    }));

    res.json({ reports });
  } catch (err) {
    next(err);
  }
};

exports.getReportById = async (req, res, next) => {
  try {
    const isPremium = await checkPremiumAccess(req.userId);
    if (!isPremium) {
      return res.status(403).json({ error: 'Premium subscription required', code: 'PREMIUM_REQUIRED' });
    }

    const result = await query(
      'SELECT * FROM ai_reports WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const r = result.rows[0];
    const periodStart = formatDate(r.period_start);
    const periodEnd = formatDate(r.period_end);

    // Legacy reports (pre-v2 schema) lack overallScore/dailyScores/etc. and
    // would render as "—" in the new paged UI. Compute the missing structured
    // fields from the user's daily_entries and merge them in. No-op for new
    // reports that already carry the v2 fields.
    let content = r.report_content;
    if (r.report_type === 'weekly' || r.report_type === 'monthly') {
      content = await applyBackfill(req.userId, r.report_type, periodStart, periodEnd, content);
    }

    res.json({
      id: r.id,
      reportType: r.report_type,
      periodStart,
      periodEnd,
      content,
      entryCount: r.entry_count,
      createdAt: r.created_at,
    });
  } catch (err) {
    next(err);
  }
};
