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

    const [weekEntries, monthEntries, yearEntries, weekReport, monthReport, yearReport] = await Promise.all([
      query(
        'SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3',
        [userId, week.start, week.end]
      ),
      query(
        'SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3',
        [userId, month.start, month.end]
      ),
      query(
        'SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3',
        [userId, year.start, year.end]
      ),
      query(
        'SELECT id FROM ai_reports WHERE user_id = $1 AND report_type = $2 AND period_start = $3 AND period_end = $4 LIMIT 1',
        [userId, 'weekly', week.start, week.end]
      ),
      query(
        'SELECT id FROM ai_reports WHERE user_id = $1 AND report_type = $2 AND period_start = $3 AND period_end = $4 LIMIT 1',
        [userId, 'monthly', month.start, month.end]
      ),
      query(
        'SELECT id FROM ai_reports WHERE user_id = $1 AND report_type = $2 AND period_start = $3 AND period_end = $4 LIMIT 1',
        [userId, 'yearly', year.start, year.end]
      ),
    ]);

    res.json({
      weekly: {
        periodStart: week.start,
        periodEnd: week.end,
        entryCount: parseInt(weekEntries.rows[0].cnt),
        requiredEntries: 3,
        daysRemaining: week.daysRemaining,
        reportReady: weekReport.rows.length > 0,
        reportId: weekReport.rows[0]?.id || null,
      },
      monthly: {
        periodStart: month.start,
        periodEnd: month.end,
        entryCount: parseInt(monthEntries.rows[0].cnt),
        requiredEntries: 10,
        daysRemaining: month.daysRemaining,
        reportReady: monthReport.rows.length > 0,
        reportId: monthReport.rows[0]?.id || null,
      },
      yearly: {
        periodStart: year.start,
        periodEnd: year.end,
        entryCount: parseInt(yearEntries.rows[0].cnt),
        requiredEntries: 50,
        daysRemaining: year.daysRemaining,
        reportReady: yearReport.rows.length > 0,
        reportId: yearReport.rows[0]?.id || null,
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
