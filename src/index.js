require('dotenv').config();

// Validate required secrets at startup — enforced in all environments
['JWT_SECRET', 'JWT_REFRESH_SECRET'].forEach((key) => {
  const val = process.env[key];
  if (!val || val.length < 32) {
    throw new Error(`${key} must be set and at least 32 characters long`);
  }
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const entryRoutes = require('./routes/entries');
const friendRoutes = require('./routes/friends');
const reportRoutes = require('./routes/reports');
const streakRoutes = require('./routes/streaks');
const subscriptionRoutes = require('./routes/subscriptions');
const notificationRoutes = require('./routes/notifications');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');
const feedbackRoutes = require('./routes/feedback');
const journalNoteRoutes = require('./routes/journalNotes');
const appRoutes = require('./routes/app');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's reverse proxy so rate limiter identifies users by real IP
app.set('trust proxy', 1);

app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin (native mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'short' : 'combined'));
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/streaks', streakRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/journal-notes', journalNoteRoutes);
app.use('/api/app', appRoutes);

app.use(errorHandler);

const { initCronJobs } = require('./services/cronService');

app.listen(PORT, () => {
  console.log(`I Can API running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    initCronJobs();
  }
});

module.exports = app;
