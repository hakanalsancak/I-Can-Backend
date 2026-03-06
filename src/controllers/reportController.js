const { query } = require('../config/database');
const { generateReport } = require('../services/aiService');
const { checkPremiumAccess } = require('../services/subscriptionService');

exports.getReports = async (req, res, next) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT id, report_type, period_start, period_end, created_at FROM ai_reports WHERE user_id = $1';
    const params = [req.userId];

    if (type) {
      sql += ' AND report_type = $2';
      params.push(type);
    }

    sql += ' ORDER BY period_start DESC LIMIT 20';
    const result = await query(sql, params);

    const reports = result.rows.map((r) => ({
      id: r.id,
      reportType: r.report_type,
      periodStart: r.period_start,
      periodEnd: r.period_end,
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
      periodStart: r.period_start,
      periodEnd: r.period_end,
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

    const { reportType, periodStart, periodEnd } = req.body;
    if (!reportType || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Report type, period start and end are required' });
    }

    const report = await generateReport(req.userId, reportType, periodStart, periodEnd);

    res.json({
      id: report.id,
      reportType: report.report_type,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      content: report.report_content,
      createdAt: report.created_at,
    });
  } catch (err) {
    if (err.message === 'No entries found for this period') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};
