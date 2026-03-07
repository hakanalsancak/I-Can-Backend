const { query } = require('../config/database');
const { generateReport } = require('../services/aiService');
const { checkPremiumAccess } = require('../services/subscriptionService');

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

exports.getReports = async (req, res, next) => {
  try {
    let sql = 'SELECT id, report_type, period_start, period_end, created_at FROM ai_reports WHERE user_id = $1';
    const params = [req.userId];

    sql += ' ORDER BY created_at DESC LIMIT 50';
    const result = await query(sql, params);

    const reports = result.rows.map((r) => ({
      id: r.id,
      reportType: r.report_type,
      periodStart: formatDate(r.period_start),
      periodEnd: formatDate(r.period_end),
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
      createdAt: r.created_at,
    });
  } catch (err) {
    next(err);
  }
};

exports.generateReport = async (req, res, next) => {
  try {
    const isPremium = await checkPremiumAccess(req.userId);
    if (!isPremium) {
      return res.status(403).json({ error: 'Premium subscription required', code: 'PREMIUM_REQUIRED' });
    }

    const { reportType } = req.body;
    if (!reportType || !['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ error: 'Report type must be weekly or monthly' });
    }

    const now = new Date();
    let periodStart, periodEnd;

    if (reportType === 'weekly') {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      periodStart = monday.toISOString().split('T')[0];
      periodEnd = sunday.toISOString().split('T')[0];
    } else {
      periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      periodEnd = lastDay.toISOString().split('T')[0];
    }

    const existing = await query(
      `SELECT * FROM ai_reports WHERE user_id = $1 AND report_type = $2
       AND period_start = $3 AND period_end = $4`,
      [req.userId, reportType, periodStart, periodEnd]
    );
    if (existing.rows.length > 0) {
      const r = existing.rows[0];
      return res.json({
        id: r.id,
        reportType: r.report_type,
        periodStart: formatDate(r.period_start),
        periodEnd: formatDate(r.period_end),
        content: r.report_content,
        createdAt: r.created_at,
        alreadyExists: true,
      });
    }

    const minEntries = reportType === 'weekly' ? 3 : 5;
    const entriesCount = await query(
      `SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1
       AND entry_date >= $2 AND entry_date <= $3`,
      [req.userId, periodStart, periodEnd]
    );
    const count = parseInt(entriesCount.rows[0].cnt);
    if (count < minEntries) {
      return res.status(400).json({
        error: `You need at least ${minEntries} entries this ${reportType === 'weekly' ? 'week' : 'month'} to generate a report. You have ${count} so far.`,
        code: 'INSUFFICIENT_ENTRIES',
        required: minEntries,
        current: count,
      });
    }

    const report = await generateReport(req.userId, reportType, periodStart, periodEnd);

    res.json({
      id: report.id,
      reportType: report.report_type,
      periodStart: formatDate(report.period_start),
      periodEnd: formatDate(report.period_end),
      content: report.report_content,
      createdAt: report.created_at,
    });
  } catch (err) {
    if (err.message === 'No entries found for this period') {
      return res.status(400).json({ error: err.message, code: 'INSUFFICIENT_ENTRIES' });
    }
    next(err);
  }
};

exports.checkCanGenerate = async (req, res, next) => {
  try {
    const { reportType } = req.query;
    if (!reportType || !['weekly', 'monthly'].includes(reportType)) {
      return res.json({ canGenerate: false, reason: 'Invalid report type' });
    }

    const now = new Date();
    let periodStart, periodEnd, periodLabel;

    if (reportType === 'weekly') {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      periodStart = monday.toISOString().split('T')[0];
      periodEnd = sunday.toISOString().split('T')[0];
      periodLabel = 'week';
    } else {
      periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      periodEnd = lastDay.toISOString().split('T')[0];
      periodLabel = 'month';
    }

    const existing = await query(
      `SELECT id FROM ai_reports WHERE user_id = $1 AND report_type = $2
       AND period_start = $3 AND period_end = $4`,
      [req.userId, reportType, periodStart, periodEnd]
    );

    if (existing.rows.length > 0) {
      return res.json({
        canGenerate: false,
        reason: `You already generated a ${reportType} report for this ${periodLabel}`,
        periodStart: formatDate(periodStart),
        periodEnd: formatDate(periodEnd),
      });
    }

    const minEntries = reportType === 'weekly' ? 3 : 5;
    const entriesCount = await query(
      `SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1
       AND entry_date >= $2 AND entry_date <= $3`,
      [req.userId, periodStart, periodEnd]
    );
    const count = parseInt(entriesCount.rows[0].cnt);

    if (count < minEntries) {
      return res.json({
        canGenerate: false,
        reason: `Need ${minEntries - count} more entries this ${periodLabel}`,
        required: minEntries,
        current: count,
        periodStart: formatDate(periodStart),
        periodEnd: formatDate(periodEnd),
      });
    }

    res.json({
      canGenerate: true,
      periodStart: formatDate(periodStart),
      periodEnd: formatDate(periodEnd),
      entryCount: count,
    });
  } catch (err) {
    next(err);
  }
};
