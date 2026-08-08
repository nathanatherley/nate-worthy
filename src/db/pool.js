// Postgres connection pool. Works with any standard Postgres provider —
// Railway, Supabase, Neon, RDS, a plain VPS with Postgres installed.
// DATABASE_URL should look like:
//   postgres://user:password@host:5432/dbname
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }, // most managed Postgres providers require SSL
});

module.exports = pool;
