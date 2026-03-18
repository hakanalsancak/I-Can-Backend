const { Pool } = require('pg');

const skipSSL = process.env.DB_SKIP_SSL_VERIFY === 'true';
if (skipSSL && process.env.NODE_ENV === 'production') {
  throw new Error('DB_SKIP_SSL_VERIFY cannot be enabled in production');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: !skipSSL },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

const query = (text, params) => pool.query(text, params);

const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
