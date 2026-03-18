const cron = require('node-cron');
const { query } = require('../config/database');
const { generateReport } = require('./aiService');
const { getRandomQuote, getUsersForNotification, logNotification } = require('./notificationService');

async function getPremiumUsers() {
  const result = await query(
    `SELECT DISTINCT u.id FROM users u
     JOIN subscriptions s ON s.user_id = u.id
     WHERE (s.status = 'active' OR (s.status = 'trial' AND s.trial_end > NOW()))
     AND u.onboarding_completed = TRUE`
  );
  return result.rows;
}

async function sendReportNotification(userId, reportType, periodLabel) {
  try {
    const tokens = await query('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
    if (tokens.rows.length === 0) return;

    const typeLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1);
    const title = `${typeLabel} Report Ready`;
    const body = `Your ${reportType} performance report is ready. See what your AI coach has to say.`;

    const deviceTokens = tokens.rows.map(t => t.token);
    const { sendPush } = require('../config/apns');
    await sendPush(deviceTokens, {
      title,
      body,
      data: { type: 'report_ready', reportType },
    });

    await logNotification(userId, 'report_ready', `Your ${reportType} report is ready`);
  } catch (err) {
    console.error(`Notification failed for user ${userId}:`, err.message);
  }
}

async function generateReportsForPeriod(reportType, periodStart, periodEnd, minEntries) {
  const users = await getPremiumUsers();
  let generated = 0;

  for (const user of users) {
    try {
      const countResult = await query(
        'SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3',
        [user.id, periodStart, periodEnd]
      );
      const count = parseInt(countResult.rows[0].cnt);
      if (count < minEntries) continue;

      // Generate new report first, then delete old ones to prevent data loss on failure
      const newReport = await generateReport(user.id, reportType, periodStart, periodEnd);

      await query(
        'DELETE FROM ai_reports WHERE user_id = $1 AND report_type = $2 AND id != $3',
        [user.id, reportType, newReport.id]
      );

      await sendReportNotification(user.id, reportType, `${periodStart} – ${periodEnd}`);
      generated++;
    } catch (err) {
      console.error(`${reportType} report failed for user ${user.id}:`, err.message);
    }
  }

  return generated;
}

function initCronJobs() {
  // Weekly: Monday 00:00 UTC — generates report for previous Mon-Sun
  cron.schedule('0 0 * * 1', async () => {
    console.log('Running weekly report generation...');
    try {
      const now = new Date();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - 1);
      const monday = new Date(sunday);
      monday.setDate(sunday.getDate() - 6);

      const periodStart = monday.toISOString().split('T')[0];
      const periodEnd = sunday.toISOString().split('T')[0];

      const count = await generateReportsForPeriod('weekly', periodStart, periodEnd, 3);
      console.log(`Generated ${count} weekly reports for ${periodStart} – ${periodEnd}`);
    } catch (err) {
      console.error('Weekly report cron error:', err.message);
    }
  });

  // Monthly: 1st of month 00:00 UTC — generates report for previous month
  cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly report generation...');
    try {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

      const periodStart = prevMonth.toISOString().split('T')[0];
      const periodEnd = lastDay.toISOString().split('T')[0];

      const count = await generateReportsForPeriod('monthly', periodStart, periodEnd, 10);
      console.log(`Generated ${count} monthly reports for ${periodStart} – ${periodEnd}`);
    } catch (err) {
      console.error('Monthly report cron error:', err.message);
    }
  });

  // Yearly: Jan 1 00:00 UTC — generates report for previous year
  cron.schedule('0 0 1 1 *', async () => {
    console.log('Running yearly report generation...');
    try {
      const now = new Date();
      const prevYear = now.getFullYear() - 1;
      const periodStart = `${prevYear}-01-01`;
      const periodEnd = `${prevYear}-12-31`;

      const count = await generateReportsForPeriod('yearly', periodStart, periodEnd, 50);
      console.log(`Generated ${count} yearly reports for ${periodStart} – ${periodEnd}`);
    } catch (err) {
      console.error('Yearly report cron error:', err.message);
    }
  });

  // Fake leaderboard users: daily at 00:05 UTC — increment streaks
  cron.schedule('5 0 * * *', async () => {
    try {
      const result = await query(
        `UPDATE streaks SET
           current_streak = current_streak + 1,
           longest_streak = GREATEST(longest_streak, current_streak + 1),
           last_entry_date = CURRENT_DATE,
           updated_at = NOW()
         WHERE user_id IN (
           SELECT id FROM users WHERE email LIKE '%@ican.seed'
         )`
      );
      console.log(`Updated ${result.rowCount} fake leaderboard streaks`);
    } catch (err) {
      console.error('Fake streak cron error:', err.message);
    }
  });

  // Motivational quotes: hourly
  cron.schedule('0 * * * *', async () => {
    try {
      const currentHour = new Date().getUTCHours();
      const sendTimes = [8, 14, 19];
      const slotIndex = sendTimes.indexOf(currentHour);
      if (slotIndex === -1) return;

      const requiredFrequency = slotIndex + 1;
      const users = await getUsersForNotification(requiredFrequency);

      const { sendPush } = require('../config/apns');
      for (const user of users) {
        const quote = getRandomQuote();
        if (user.token) {
          await sendPush([user.token], {
            title: 'I Can',
            body: quote,
            data: { type: 'motivational_quote' },
          });
        }
        await logNotification(user.id, 'motivational_quote', quote);
      }
    } catch (err) {
      console.error('Quote notification cron error:', err.message);
    }
  });

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs };
