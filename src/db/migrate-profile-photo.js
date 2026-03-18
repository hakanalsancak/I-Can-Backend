require('dotenv').config();
const { pool } = require('../config/database');

async function migrate() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(500)");
    console.log('Migration complete: profile_photo_url column added to users table');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
