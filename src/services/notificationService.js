const { query } = require('../config/database');

const MOTIVATIONAL_QUOTES = [
  'I Can stay focused when pressure rises.',
  'I Can improve every training session.',
  'I Can learn from mistakes and grow stronger.',
  'I Can push through challenges.',
  'I Can stay disciplined even when it gets tough.',
  'I Can control my effort every single day.',
  'I Can turn setbacks into comebacks.',
  'I Can be better than yesterday.',
  'I Can trust my training.',
  'I Can perform under pressure.',
  'I Can stay mentally strong.',
  'I Can outwork the competition.',
  'I Can keep going when others stop.',
  'I Can choose greatness today.',
  'I Can embrace the process.',
  'I Can stay calm and confident.',
  'I Can make today count.',
  'I Can build winning habits.',
  'I Can rise to every challenge.',
  'I Can show up and give my best.',
];

function getRandomQuote() {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

async function getUsersForNotification(frequency) {
  const result = await query(
    `SELECT u.id, dt.token FROM users u
     JOIN device_tokens dt ON dt.user_id = u.id
     WHERE u.notification_frequency >= $1`,
    [frequency]
  );
  return result.rows;
}

async function logNotification(userId, type, content) {
  await query(
    'INSERT INTO notification_log (user_id, notification_type, content) VALUES ($1, $2, $3)',
    [userId, type, content]
  );
}

module.exports = { getRandomQuote, getUsersForNotification, logNotification, MOTIVATIONAL_QUOTES };
