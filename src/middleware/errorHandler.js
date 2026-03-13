const errorHandler = (err, req, res, _next) => {
  // Sanitize message before logging — strip connection strings and tokens
  const safeMessage = (err.message || '')
    .replace(/postgresql:\/\/[^\s]*/gi, '[DB_URL]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [TOKEN]')
    .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');

  console.error('Error:', safeMessage);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource not found' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
};

module.exports = errorHandler;
