// PostgreSQL connection pool.
// Uses environment variables so no credentials are ever hardcoded/committed.
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,          // RDS endpoint, e.g. thaidelight-db.xxxx.us-east-1.rds.amazonaws.com
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // Unexpected error on idle client - log it, don't crash the app
  console.error('Unexpected PG pool error', err);
});

// ALWAYS use parameterized queries ($1, $2...) via this helper.
// Never build SQL with string concatenation - that's how SQL injection happens.
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

module.exports = { query, pool };
