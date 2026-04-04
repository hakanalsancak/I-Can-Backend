const cron = require('node-cron');
const { query } = require('../config/database');
const { generateReport } = require('./aiService');
const { getRandomQuote, getUsersForNotification, logNotification } = require('./notificationService');

async function getPremiumUsers() {
  const result = await query(
    `SELECT DISTINCT u.id FROM users u
     JOIN subscriptions s ON s.user_id = u.id
     WHERE ((s.status = 'active' AND s.current_period_end > NOW()) OR (s.status = 'trial' AND s.trial_end > NOW()))
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

async function catchUpMissedReports() {
  console.log('Checking for missed reports...');
  const now = new Date();

  // Check missed weekly: if today is Mon–Wed and no weekly report exists for last week
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  if (dayOfWeek >= 1 && dayOfWeek <= 3) {
    const lastSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek));
    const lastMonday = new Date(Date.UTC(lastSunday.getUTCFullYear(), lastSunday.getUTCMonth(), lastSunday.getUTCDate() - 6));
    const periodStart = lastMonday.toISOString().split('T')[0];
    const periodEnd = lastSunday.toISOString().split('T')[0];

    const existing = await query(
      "SELECT 1 FROM ai_reports WHERE report_type = 'weekly' AND period_start = $1 AND period_end = $2 LIMIT 1",
      [periodStart, periodEnd]
    );
    if (existing.rows.length === 0) {
      console.log(`Catching up missed weekly reports for ${periodStart} – ${periodEnd}`);
      try {
        const count = await generateReportsForPeriod('weekly', periodStart, periodEnd, 3);
        console.log(`Catch-up: generated ${count} weekly reports`);
      } catch (err) {
        console.error('Catch-up weekly report error:', err.message);
      }
    }
  }

  // Check missed monthly: if we're in the first 3 days of the month
  if (now.getUTCDate() <= 3) {
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const periodStart = prevMonth.toISOString().split('T')[0];
    const periodEnd = lastDay.toISOString().split('T')[0];

    const existing = await query(
      "SELECT 1 FROM ai_reports WHERE report_type = 'monthly' AND period_start = $1 AND period_end = $2 LIMIT 1",
      [periodStart, periodEnd]
    );
    if (existing.rows.length === 0) {
      console.log(`Catching up missed monthly reports for ${periodStart} – ${periodEnd}`);
      try {
        const count = await generateReportsForPeriod('monthly', periodStart, periodEnd, 10);
        console.log(`Catch-up: generated ${count} monthly reports`);
      } catch (err) {
        console.error('Catch-up monthly report error:', err.message);
      }
    }
  }

  // Check missed yearly: if we're in the first 3 days of January
  if (now.getUTCMonth() === 0 && now.getUTCDate() <= 3) {
    const prevYear = now.getUTCFullYear() - 1;
    const periodStart = `${prevYear}-01-01`;
    const periodEnd = `${prevYear}-12-31`;

    const existing = await query(
      "SELECT 1 FROM ai_reports WHERE report_type = 'yearly' AND period_start = $1 AND period_end = $2 LIMIT 1",
      [periodStart, periodEnd]
    );
    if (existing.rows.length === 0) {
      console.log(`Catching up missed yearly reports for ${periodStart} – ${periodEnd}`);
      try {
        const count = await generateReportsForPeriod('yearly', periodStart, periodEnd, 50);
        console.log(`Catch-up: generated ${count} yearly reports`);
      } catch (err) {
        console.error('Catch-up yearly report error:', err.message);
      }
    }
  }

  console.log('Missed report check complete');
}

function initCronJobs() {
  console.log(`Initializing cron jobs (NODE_ENV=${process.env.NODE_ENV})`);

  // Eagerly initialize APNS provider to surface config issues at startup
  const { sendPush, initProvider } = require('../config/apns');
  initProvider();

  // Run catch-up on startup (delayed 10s to let DB connections settle)
  setTimeout(() => catchUpMissedReports().catch(err => console.error('Catch-up error:', err.message)), 10000);

  // Weekly: Monday 00:00 UTC — generates report for previous Mon-Sun
  cron.schedule('0 0 * * 1', async () => {
    console.log('Running weekly report generation...');
    try {
      const now = new Date();
      const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const monday = new Date(Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate() - 6));

      const periodStart = monday.toISOString().split('T')[0];
      const periodEnd = sunday.toISOString().split('T')[0];

      const count = await generateReportsForPeriod('weekly', periodStart, periodEnd, 3);
      console.log(`Generated ${count} weekly reports for ${periodStart} – ${periodEnd}`);
    } catch (err) {
      console.error('Weekly report cron error:', err.message);
    }
  }, { timezone: 'UTC' });

  // Monthly: 1st of month 00:00 UTC — generates report for previous month
  cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly report generation...');
    try {
      const now = new Date();
      const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

      const periodStart = prevMonth.toISOString().split('T')[0];
      const periodEnd = lastDay.toISOString().split('T')[0];

      const count = await generateReportsForPeriod('monthly', periodStart, periodEnd, 10);
      console.log(`Generated ${count} monthly reports for ${periodStart} – ${periodEnd}`);
    } catch (err) {
      console.error('Monthly report cron error:', err.message);
    }
  }, { timezone: 'UTC' });

  // Yearly: Jan 1 00:00 UTC — generates report for previous year
  cron.schedule('0 0 1 1 *', async () => {
    console.log('Running yearly report generation...');
    try {
      const now = new Date();
      const prevYear = now.getUTCFullYear() - 1;
      const periodStart = `${prevYear}-01-01`;
      const periodEnd = `${prevYear}-12-31`;

      const count = await generateReportsForPeriod('yearly', periodStart, periodEnd, 50);
      console.log(`Generated ${count} yearly reports for ${periodStart} – ${periodEnd}`);
    } catch (err) {
      console.error('Yearly report cron error:', err.message);
    }
  }, { timezone: 'UTC' });

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
  }, { timezone: 'UTC' });

  // Mark expired subscriptions: daily at 02:00 UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await query(
        `UPDATE subscriptions SET status = 'expired', updated_at = NOW()
         WHERE status IN ('active', 'trial')
         AND (
           (status = 'active' AND current_period_end < NOW())
           OR (status = 'trial' AND trial_end < NOW())
         )`
      );
      if (result.rowCount > 0) {
        console.log(`Marked ${result.rowCount} subscriptions as expired`);
      }
    } catch (err) {
      console.error('Subscription expiration cron error:', err.message);
    }
  }, { timezone: 'UTC' });

  // Clean up expired refresh tokens: daily at 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    try {
      const result = await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
      console.log(`Cleaned up ${result.rowCount} expired refresh tokens`);
    } catch (err) {
      console.error('Refresh token cleanup cron error:', err.message);
    }
  }, { timezone: 'UTC' });

  // Motivational quotes: hourly
  cron.schedule('0 * * * *', async () => {
    try {
      const currentHour = new Date().getUTCHours();
      const sendTimes = [8, 14, 19];
      const slotIndex = sendTimes.indexOf(currentHour);
      if (slotIndex === -1) return;

      const requiredFrequency = slotIndex + 1;
      console.log(`Motivational quote cron firing at UTC hour ${currentHour}, requiredFrequency=${requiredFrequency}`);

      const users = await getUsersForNotification(requiredFrequency);
      console.log(`Found ${users.length} users for motivational quotes`);

      if (users.length === 0) return;

      const { sendPush } = require('../config/apns');
      let sent = 0;
      let failed = 0;
      for (const user of users) {
        try {
          const quote = getRandomQuote();
          if (user.token) {
            await sendPush([user.token], {
              title: 'I Can',
              body: quote,
              data: { type: 'motivational_quote' },
            });
            sent++;
          }
          await logNotification(user.id, 'motivational_quote', quote);
        } catch (userErr) {
          failed++;
          console.error(`Quote push failed for user ${user.id}:`, userErr.message);
        }
      }
      console.log(`Motivational quotes: ${sent} sent, ${failed} failed out of ${users.length} users`);
    } catch (err) {
      console.error('Quote notification cron error:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs, catchUpMissedReports };
