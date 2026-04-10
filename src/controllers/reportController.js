const { query } = require('../config/database');
const { checkPremiumAccess } = require('../services/subscriptionService');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

function getCurrentWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
    daysRemaining: Math.max(0, Math.ceil((sunday - now) / 86400000)),
  };
}

function getCurrentMonthBounds() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start,
    end: lastDay.toISOString().split('T')[0],
    daysRemaining: Math.max(0, lastDay.getDate() - now.getDate()),
  };
}

function getCurrentYearBounds() {
  const now = new Date();
  const start = `${now.getFullYear()}-01-01`;
  const end = `${now.getFullYear()}-12-31`;
  const endDate = new Date(now.getFullYear(), 11, 31);
  return {
    start,
    end,
    daysRemaining: Math.max(0, Math.ceil((endDate - now) / 86400000)),
  };
}

exports.getStatus = async (req, res, next) => {
  try {
    const userId = req.userId;

    const week = getCurrentWeekBounds();
    const month = getCurrentMonthBounds();
    const year = getCurrentYearBounds();

    const [counts, reports] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE entry_date >= $2 AND entry_date <= $3) AS week_cnt,
           COUNT(*) FILTER (WHERE entry_date >= $4 AND entry_date <= $5) AS month_cnt,
           COUNT(*) FILTER (WHERE entry_date >= $6 AND entry_date <= $7) AS year_cnt
         FROM daily_entries WHERE user_id = $1`,
        [userId, week.start, week.end, month.start, month.end, year.start, year.end]
      ),
      query(
        `SELECT report_type, id FROM ai_reports
         WHERE user_id = $1 AND (
           (report_type = 'weekly'  AND period_start = $2 AND period_end = $3) OR
           (report_type = 'monthly' AND period_start = $4 AND period_end = $5) OR
           (report_type = 'yearly'  AND period_start = $6 AND period_end = $7)
         )`,
        [userId, week.start, week.end, month.start, month.end, year.start, year.end]
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
      yearly: {
        periodStart: year.start,
        periodEnd: year.end,
        entryCount: parseInt(c.year_cnt),
        requiredEntries: 50,
        daysRemaining: year.daysRemaining,
        reportReady: !!reportMap.yearly,
        reportId: reportMap.yearly || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getReports = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, report_type, period_start, period_end, entry_count, created_at
       FROM ai_reports WHERE user_id = $1
       ORDER BY period_end DESC, created_at DESC LIMIT 50`,
      [req.userId]
    );

    const reports = result.rows.map((r) => ({
      id: r.id,
      reportType: r.report_type,
      periodStart: formatDate(r.period_start),
      periodEnd: formatDate(r.period_end),
      entryCount: r.entry_count,
      createdAt: r.created_at,
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
    res.json({
      id: r.id,
      reportType: r.report_type,
      periodStart: formatDate(r.period_start),
      periodEnd: formatDate(r.period_end),
      content: r.report_content,
      entryCount: r.entry_count,
      createdAt: r.created_at,
    });
  } catch (err) {
    next(err);
  }
};
