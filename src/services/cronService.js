const cron = require('node-cron');
const { query } = require('../config/database');
const { generateReport } = require('./aiService');
const { getRandomQuote, getUsersForNotification, logNotification } = require('./notificationService');

function initCronJobs() {
  // Weekly reports: every Sunday at 9 PM UTC
  cron.schedule('0 21 * * 0', async () => {
    console.log('Running weekly report generation...');
    try {
      const users = await query(
        `SELECT DISTINCT u.id FROM users u
         JOIN subscriptions s ON s.user_id = u.id
         WHERE (s.status = 'active' OR (s.status = 'trial' AND s.trial_end > NOW()))
         AND u.onboarding_completed = TRUE`
      );

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      for (const user of users.rows) {
        try {
          await generateReport(
            user.id, 'weekly',
            weekAgo.toISOString().split('T')[0],
            now.toISOString().split('T')[0]
          );
        } catch (err) {
          console.error(`Weekly report failed for user ${user.id}:`, err.message);
        }
      }
      console.log(`Generated weekly reports for ${users.rows.length} users`);
    } catch (err) {
      console.error('Weekly report cron error:', err.message);
    }
  });

  // Monthly reports: 1st of every month at 10 PM UTC
  cron.schedule('0 22 1 * *', async () => {
    console.log('Running monthly report generation...');
    try {
      const users = await query(
        `SELECT DISTINCT u.id FROM users u
         JOIN subscriptions s ON s.user_id = u.id
         WHERE (s.status = 'active' OR (s.status = 'trial' AND s.trial_end > NOW()))
         AND u.onboarding_completed = TRUE`
      );

      const now = new Date();
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      for (const user of users.rows) {
        try {
          await generateReport(
            user.id, 'monthly',
            monthAgo.toISOString().split('T')[0],
            now.toISOString().split('T')[0]
          );
        } catch (err) {
          console.error(`Monthly report failed for user ${user.id}:`, err.message);
        }
      }
      console.log(`Generated monthly reports for ${users.rows.length} users`);
    } catch (err) {
      console.error('Monthly report cron error:', err.message);
    }
  });

  // Motivational quotes: runs hourly, sends based on user timezone and frequency
  cron.schedule('0 * * * *', async () => {
    try {
      const currentHour = new Date().getUTCHours();
      // Send quotes at morning (8), afternoon (14), evening (19) UTC-adjusted
      const sendTimes = [8, 14, 19];
      const slotIndex = sendTimes.indexOf(currentHour);
      if (slotIndex === -1) return;

      const requiredFrequency = slotIndex + 1;
      const users = await getUsersForNotification(requiredFrequency);

      for (const user of users) {
        const quote = getRandomQuote();
        await logNotification(user.id, 'motivational_quote', quote);
        // APNS push would happen here with the device token
      }
    } catch (err) {
      console.error('Quote notification cron error:', err.message);
    }
  });

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs };
