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

// Get premium users whose local midnight hour (00:xx) is right now
async function getPremiumUsersAtLocalMidnight() {
  const result = await query(
    `SELECT DISTINCT u.id, u.timezone FROM users u
     JOIN subscriptions s ON s.user_id = u.id
     WHERE ((s.status = 'active' AND s.current_period_end > NOW()) OR (s.status = 'trial' AND s.trial_end > NOW()))
     AND u.onboarding_completed = TRUE
     AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(u.timezone, 'UTC')) = 0`
  );
  return result.rows;
}

// Helper: get the local date parts for a user's timezone
function getLocalDateParts(tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month),
    day: parseInt(parts.day),
    weekday: parts.weekday, // Mon, Tue, etc.
  };
}

async function sendReportNotification(userId, reportType, reportId, userFirstName) {
  try {
    const tokens = await query('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
    if (tokens.rows.length === 0) return;

    // Personalized, time-locked-release copy. Matches the new "report card" UX.
    const namePrefix = userFirstName ? `${userFirstName}, ` : '';
    const title = reportType === 'weekly'
      ? `${namePrefix}your week is graded`
      : `${namePrefix}your month is in`;
    const body = reportType === 'weekly'
      ? `Open your weekly report card. Best day, worst day, one move.`
      : `Your monthly verdict is ready. Trend, consistency, focus.`;

    const deviceTokens = tokens.rows.map(t => t.token);
    const { sendPush } = require('../config/apns');
    await sendPush(deviceTokens, {
      title,
      body,
      data: { type: 'report_ready', reportType, reportId: reportId || null },
    });

    await logNotification(userId, 'report_ready', `Your ${reportType} report is ready`);
  } catch (err) {
    console.error(`Notification failed for user ${userId}:`, err.message);
  }
}

async function generateReportForUser(user, reportType, periodStart, periodEnd, minEntries) {
  const countResult = await query(
    'SELECT COUNT(*) as cnt FROM daily_entries WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3',
    [user.id, periodStart, periodEnd]
  );
  const count = parseInt(countResult.rows[0].cnt);
  if (count < minEntries) return false;

  const newReport = await generateReport(user.id, reportType, periodStart, periodEnd);

  // Dedup: remove any other report for the SAME period (in case of retries).
  // Older reports for different periods are preserved so the client can show them
  // under "Saved Reports".
  await query(
    `DELETE FROM ai_reports
       WHERE user_id = $1 AND report_type = $2
         AND period_start = $3 AND period_end = $4 AND id != $5`,
    [user.id, reportType, periodStart, periodEnd, newReport.id]
  );

  // Look up first name for personalized push copy. Best-effort — push still
  // sends if this fails.
  let firstName = null;
  try {
    const u = await query('SELECT full_name FROM users WHERE id = $1', [user.id]);
    if (u.rows[0] && u.rows[0].full_name) {
      firstName = String(u.rows[0].full_name).trim().split(/\s+/)[0] || null;
    }
  } catch (_) { /* ignore */ }

  await sendReportNotification(user.id, reportType, newReport.id, firstName);
  return true;
}

async function generateReportsForPeriod(reportType, periodStart, periodEnd, minEntries) {
  const users = await getPremiumUsers();
  return await processUserBatch(users, reportType, periodStart, periodEnd, minEntries);
}

async function processUserBatch(users, reportType, periodStart, periodEnd, minEntries) {
  let generated = 0;
  const CONCURRENCY = 20;
  const PER_USER_TIMEOUT = 60000;

  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Report generation timed out')), ms)),
  ]);

  // Process users in parallel batches with per-user timeout
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(user => withTimeout(
        generateReportForUser(user, reportType, periodStart, periodEnd, minEntries),
        PER_USER_TIMEOUT
      ))
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled' && results[j].value === true) {
        generated++;
      } else if (results[j].status === 'rejected') {
        console.error(`${reportType} report failed for user ${batch[j].id}:`, results[j].reason.message);
      }
    }

    if ((i + CONCURRENCY) % 100 === 0 && i > 0) {
      console.log(`${reportType} report progress: ${i + CONCURRENCY}/${users.length} users processed, ${generated} generated`);
    }
  }

  return generated;
}

// Compute the PREVIOUS Mon-Sun week bounds for a given IANA timezone.
// Used by the weekly cron which fires at Monday local midnight — the week we want
// to report on is the one that just ended (Mon..Sun ending yesterday), not the
// new week starting today.
function getWeekBoundsForTimezone(tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
  const year = parseInt(parts.year);
  const month = parseInt(parts.month);
  const day = parseInt(parts.day);
  const local = new Date(Date.UTC(year, month - 1, day));
  const dow = local.getUTCDay(); // 0=Sun
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(year, month - 1, day - diffToMonday - 7));
  const sunday = new Date(Date.UTC(year, month - 1, day - diffToMonday - 1));
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

// Compute previous month bounds for a given IANA timezone
function getMonthBoundsForTimezone(tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
  const year = parseInt(parts.year);
  const month = parseInt(parts.month); // 1-based
  const prevStart = new Date(Date.UTC(year, month - 2, 1));
  const prevEnd = new Date(Date.UTC(year, month - 1, 0));
  return {
    start: prevStart.toISOString().split('T')[0],
    end: prevEnd.toISOString().split('T')[0],
  };
}

// Generate reports for a list of users, grouping by timezone to compute correct period bounds
async function generateTimezoneAwareReports(users, reportType, minEntries, boundsFn) {
  // Group users by their period bounds (users in same timezone offset share bounds)
  const groups = {};
  for (const user of users) {
    const tz = user.timezone || 'UTC';
    const bounds = boundsFn(tz);
    const key = `${bounds.start}_${bounds.end}`;
    if (!groups[key]) groups[key] = { ...bounds, users: [] };
    groups[key].users.push(user);
  }

  let totalGenerated = 0;
  for (const key of Object.keys(groups)) {
    const { start, end, users: groupUsers } = groups[key];
    const count = await processUserBatch(groupUsers, reportType, start, end, minEntries);
    totalGenerated += count;
    if (Object.keys(groups).length > 1) {
      console.log(`${reportType} reports for period ${start} – ${end}: ${count} generated (${groupUsers.length} users)`);
    }
  }
  return totalGenerated;
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

  console.log('Missed report check complete');
}

function initCronJobs() {
  console.log(`Initializing cron jobs (NODE_ENV=${process.env.NODE_ENV})`);

  // Eagerly initialize APNS provider to surface config issues at startup
  const { sendPush, initProvider } = require('../config/apns');
  initProvider();

  // Run catch-up on startup (delayed 10s to let DB connections settle)
  setTimeout(() => catchUpMissedReports().catch(err => console.error('Catch-up error:', err.message)), 10000);

  // Timezone-aware report generation — runs every hour, generates reports
  // for users whose local time just hit midnight on the relevant day.
  // UK users get reports at UK midnight, Turkey at Turkey midnight, US at US midnight, etc.
  cron.schedule('0 * * * *', async () => {
    try {
      // Find all premium users whose local time is currently 00:xx (midnight hour)
      const midnightUsers = await getPremiumUsersAtLocalMidnight();
      if (midnightUsers.length === 0) return;

      // Categorize by what day it is locally for each user
      const weeklyUsers = [];
      const monthlyUsers = [];

      for (const user of midnightUsers) {
        const tz = user.timezone || 'UTC';
        const local = getLocalDateParts(tz);

        // Weekly: it's Monday locally
        if (local.weekday === 'Mon') weeklyUsers.push(user);
        // Monthly: it's the 1st locally
        if (local.day === 1) monthlyUsers.push(user);
      }

      if (weeklyUsers.length > 0) {
        console.log(`Weekly report: ${weeklyUsers.length} users hitting Monday midnight`);
        const count = await generateTimezoneAwareReports(weeklyUsers, 'weekly', 3, getWeekBoundsForTimezone);
        console.log(`Generated ${count} weekly reports`);
      }

      if (monthlyUsers.length > 0) {
        console.log(`Monthly report: ${monthlyUsers.length} users hitting 1st of month midnight`);
        const count = await generateTimezoneAwareReports(monthlyUsers, 'monthly', 10, getMonthBoundsForTimezone);
        console.log(`Generated ${count} monthly reports`);
      }
    } catch (err) {
      console.error('Report generation cron error:', err.message);
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
          const tokens = (user.tokens || []).filter(Boolean);
          if (tokens.length > 0) {
            await sendPush(tokens, {
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
